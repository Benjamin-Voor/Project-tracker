"""
PostgreSQL data access for the users service.

Reuses a module-level connection across Lambda invocations. Every mutation
writes its audit_log row in the same transaction.
"""

import json
import secrets
import string
from typing import Any, Optional

from psycopg import Connection, connect
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

PG_CONN: Optional[Connection] = None

USER_COLUMNS = (
    "id, username, first_name, last_name, email, role, job_title, salary, "
    "manager_id, is_archived, created_at"
)
USERNAME_ALPHABET = string.ascii_lowercase + string.digits


class DuplicateUserError(Exception):
    """Raised when a username or email already exists."""


class InvalidManagerError(Exception):
    """Raised when manager_id does not reference an active manager."""


class ConflictError(Exception):
    """Raised when the request conflicts with current data or business rules."""


def _get_connection(config: str) -> Connection:
    """Return the pooled connection, reconnecting if it is closed."""
    global PG_CONN
    if PG_CONN is None or PG_CONN.closed:
        PG_CONN = connect(config, autocommit=True, row_factory=dict_row)
    return PG_CONN


def reset_connection() -> None:
    """Drop the pooled connection so the next call reconnects."""
    global PG_CONN
    PG_CONN = None


def _audit(cur: Any, actor: dict[str, Any], action: str, entity_id: Any, changes: dict[str, Any]) -> None:
    """Append an audit_log row for the acting user."""
    cur.execute(
        """
        INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, changes, source)
        VALUES (%s, %s, %s, 'user', %s, %s, 'users-service')
        """,
        (actor["id"], actor["role"], action, entity_id,
         Jsonb(changes, dumps=lambda v: json.dumps(v, default=str))),
    )


def _require_manager(cur: Any, manager_id: str) -> None:
    """Raise InvalidManagerError unless manager_id is an active manager."""
    cur.execute(
        "SELECT 1 FROM users WHERE id = %s AND role = 'manager' AND is_archived = false",
        (manager_id,),
    )
    if cur.fetchone() is None:
        raise InvalidManagerError("manager_id must reference an active manager")


def list_users(
    config: str, actor: dict[str, Any], include_archived: bool = False
) -> list[dict[str, Any]]:
    """
    Return the users the actor may see, newest first.

    Admins see everyone, managers see themselves and their own employees,
    employees see only themselves. Never selects password_hash.
    """
    where: list[str] = []
    params: list[Any] = []
    if actor["role"] == "manager":
        where.append("(id = %s OR manager_id = %s)")
        params.extend([actor["id"], actor["id"]])
    elif actor["role"] == "employee":
        where.append("id = %s")
        params.append(actor["id"])
    if not (actor["role"] == "admin" and include_archived):
        where.append("is_archived = false")

    query = f"SELECT {USER_COLUMNS} FROM users"
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY created_at DESC"
    with _get_connection(config).cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def get_actor(config: str, actor_id: str) -> Optional[dict[str, Any]]:
    """Return the active user acting on the request, or None."""
    with _get_connection(config).cursor() as cur:
        cur.execute(
            "SELECT id, role FROM users WHERE id = %s AND is_archived = false",
            (actor_id,),
        )
        return cur.fetchone()


def get_user(config: str, user_id: str) -> Optional[dict[str, Any]]:
    """Return one user (archived included), or None."""
    with _get_connection(config).cursor() as cur:
        cur.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
        return cur.fetchone()


def create_user(config: str, actor: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """
    Insert a user with a generated 6-character username, plus its audit row.

    The password is hashed in Postgres with pgcrypto bcrypt, and the new user
    must change it at first login.

    Raises:
        DuplicateUserError: the email already exists.
        InvalidManagerError: manager_id is not an active manager.
    """
    conn = _get_connection(config)
    for _ in range(5):
        username = "".join(secrets.choice(USERNAME_ALPHABET) for _ in range(6))
        try:
            with conn.transaction(), conn.cursor() as cur:
                manager_id = data.get("manager_id")
                if manager_id:
                    _require_manager(cur, manager_id)
                cur.execute(
                    f"""
                    INSERT INTO users (
                        username, first_name, last_name, email, password_hash,
                        role, job_title, salary, manager_id, must_change_password
                    )
                    VALUES (%s, %s, %s, %s, crypt(%s, gen_salt('bf')), %s, %s, %s, %s, true)
                    RETURNING {USER_COLUMNS}
                    """,
                    (
                        username, data["first_name"], data["last_name"], data["email"],
                        data["password"], data["role"], data.get("job_title"),
                        data.get("salary"), manager_id,
                    ),
                )
                user = cur.fetchone()
                _audit(cur, actor, "create", user["id"], {
                    "username": user["username"],
                    "email": user["email"],
                    "role": user["role"],
                    "manager_id": user["manager_id"],
                })
                return user
        except UniqueViolation as exc:
            if "email" in str(exc.diag.constraint_name or ""):
                raise DuplicateUserError("A user with that email already exists") from exc
    raise DuplicateUserError("Could not generate a unique username; try again")


def update_user(config: str, actor: dict[str, Any], user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """
    Update user fields and write an audit row with the changes.

    Changing an employee's manager is refused while they are allocated to
    projects, because allocations require the manager to match.
    """
    if not data:
        raise ConflictError("No editable fields supplied")
    conn = _get_connection(config)
    try:
        with conn.transaction(), conn.cursor() as cur:
            if "manager_id" in data:
                _require_manager(cur, data["manager_id"])
                cur.execute(
                    "SELECT 1 FROM users WHERE id = %s AND manager_id IS DISTINCT FROM %s",
                    (user_id, data["manager_id"]),
                )
                if cur.fetchone() is not None:
                    cur.execute("SELECT 1 FROM project_allocations WHERE user_id = %s", (user_id,))
                    if cur.fetchone() is not None:
                        raise ConflictError("Remove the employee from their projects before changing their manager")
            assignments = ", ".join(f"{name} = %s" for name in data)
            cur.execute(
                f"UPDATE users SET {assignments} WHERE id = %s RETURNING {USER_COLUMNS}",
                [*data.values(), user_id],
            )
            user = cur.fetchone()
            action = "assign_manager" if "manager_id" in data else "update"
            _audit(cur, actor, action, user_id, data)
            return user
    except UniqueViolation as exc:
        raise DuplicateUserError("A user with that email already exists") from exc


def set_user_archived(config: str, actor: dict[str, Any], user_id: str, archived: bool) -> dict[str, Any]:
    """
    Archive or restore a user.

    Archiving detaches the user from milestones and is refused for a manager
    who still has active employees or projects.
    """
    conn = _get_connection(config)
    with conn.transaction(), conn.cursor() as cur:
        if archived:
            cur.execute(
                """
                SELECT (SELECT count(*) FROM users WHERE manager_id = %s AND is_archived = false)
                     + (SELECT count(*) FROM projects WHERE manager_id = %s AND is_archived = false) AS open
                """,
                (user_id, user_id),
            )
            if cur.fetchone()["open"] > 0:
                raise ConflictError("Reassign this manager's employees and projects before archiving them")
            cur.execute(
                "UPDATE milestone_assignments SET detached_at = NOW() "
                "WHERE user_id = %s AND detached_at IS NULL",
                (user_id,),
            )
        cur.execute(
            f"""
            UPDATE users SET is_archived = %s, archived_at = CASE WHEN %s THEN NOW() ELSE NULL END
            WHERE id = %s RETURNING {USER_COLUMNS}
            """,
            (archived, archived, user_id),
        )
        user = cur.fetchone()
        _audit(cur, actor, "archive" if archived else "restore", user_id, {"is_archived": archived})
        return user


def list_audit(config: str, entity_type: Optional[str], limit: int) -> list[dict[str, Any]]:
    """Return the newest audit_log rows with the actor's name, optionally for one entity type."""
    query = """
        SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.changes, a.source,
               a.actor_role, u.username AS actor_username,
               u.first_name || ' ' || u.last_name AS actor_name
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.actor_id
    """
    params: list[Any] = []
    if entity_type:
        query += " WHERE a.entity_type = %s"
        params.append(entity_type)
    query += " ORDER BY a.created_at DESC LIMIT %s"
    params.append(limit)
    with _get_connection(config).cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()
