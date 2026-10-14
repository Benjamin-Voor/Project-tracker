"""
PostgreSQL data access for the users service.

Reuses a module-level connection across Lambda invocations.
"""

from typing import Any, Optional

from psycopg import Connection, connect
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

PG_CONN: Optional[Connection] = None

USER_COLUMNS = (
    "id, username, first_name, last_name, email, role, job_title, "
    "manager_id, is_archived, created_at"
)


class DuplicateUserError(Exception):
    """Raised when a username or email already exists."""


class InvalidManagerError(Exception):
    """Raised when manager_id does not reference an active manager."""


def _get_connection(config: str) -> Connection:
    """Return the pooled connection, reconnecting if it is closed."""
    global PG_CONN
    if PG_CONN is None or PG_CONN.closed:
        PG_CONN = connect(config, autocommit=True, row_factory=dict_row)
    return PG_CONN


def _reset_connection() -> None:
    """Drop the pooled connection so the next call reconnects."""
    global PG_CONN
    PG_CONN = None


def list_users(
    config: str, actor: dict[str, Any], include_archived: bool = False
) -> list[dict[str, Any]]:
    """
    Return the users the actor may see, newest first.

    Admins see everyone, managers see themselves and their own employees,
    employees see only themselves. Never selects password_hash or salary.
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
    try:
        with _get_connection(config).cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
    except Exception:
        _reset_connection()
        raise


def get_actor(config: str, actor_id: str) -> Optional[dict[str, Any]]:
    """Return the active user acting on the request, or None."""
    try:
        with _get_connection(config).cursor() as cur:
            cur.execute(
                "SELECT id, role FROM users WHERE id = %s AND is_archived = false",
                (actor_id,),
            )
            return cur.fetchone()
    except Exception:
        _reset_connection()
        raise


def create_user(config: str, actor: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """
    Insert a user and its audit_log entry in one transaction.

    The password is hashed in Postgres with pgcrypto bcrypt, and the new user
    must change it at first login.

    Raises:
        DuplicateUserError: username or email already exists.
        InvalidManagerError: manager_id is not an active manager.
    """
    try:
        conn = _get_connection(config)
        with conn.transaction():
            with conn.cursor() as cur:
                manager_id = data.get("manager_id")
                if manager_id:
                    cur.execute(
                        "SELECT 1 FROM users "
                        "WHERE id = %s AND role = 'manager' AND is_archived = false",
                        (manager_id,),
                    )
                    if cur.fetchone() is None:
                        raise InvalidManagerError("manager_id must reference an active manager")

                try:
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
                            data["username"],
                            data["first_name"],
                            data["last_name"],
                            data["email"],
                            data["password"],
                            data["role"],
                            data.get("job_title"),
                            data.get("salary"),
                            manager_id,
                        ),
                    )
                except UniqueViolation as exc:
                    raise DuplicateUserError("username or email already exists") from exc

                user = cur.fetchone()
                cur.execute(
                    """
                    INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, changes, source)
                    VALUES (%s, %s, 'create', 'user', %s, %s, 'users-service')
                    """,
                    (
                        actor["id"],
                        actor["role"],
                        user["id"],
                        Jsonb({
                            "username": user["username"],
                            "email": user["email"],
                            "role": user["role"],
                            "manager_id": str(user["manager_id"]) if user["manager_id"] else None,
                        }),
                    ),
                )
                return user
    except (DuplicateUserError, InvalidManagerError):
        raise
    except Exception:
        _reset_connection()
        raise
