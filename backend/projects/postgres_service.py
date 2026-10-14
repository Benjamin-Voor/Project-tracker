"""
PostgreSQL data access for the projects service.

Every mutation writes its audit_log row in the same transaction.
"""

import json
from typing import Any, Optional

from psycopg import Connection, connect
from psycopg.errors import CheckViolation, RaiseException, UniqueViolation
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

PG_CONN: Optional[Connection] = None

PROJECT_SELECT = """
    SELECT p.id, p.name, p.description, p.start_date, p.end_date, p.allocated_hours,
           p.budget, p.manager_id, p.status, p.is_archived, p.archived_at,
           p.created_by, p.created_at, p.updated_at,
           m.first_name || ' ' || m.last_name AS manager_name,
           (SELECT count(*) FROM project_allocations pa WHERE pa.project_id = p.id)
               AS allocation_count
    FROM projects p
    JOIN users m ON m.id = p.manager_id
"""

UPDATABLE_FIELDS = (
    "name", "description", "start_date", "end_date",
    "allocated_hours", "budget", "status", "manager_id",
)


class NotFoundError(Exception):
    """Raised when a referenced row does not exist."""


class ConflictError(Exception):
    """Raised when the request conflicts with current data or business rules."""


class ValidationFailure(Exception):
    """Raised with a field-to-message mapping when input violates a rule."""

    def __init__(self, fields: dict[str, str]) -> None:
        super().__init__("Validation failed")
        self.fields = fields


def _conn(config: str) -> Connection:
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
        VALUES (%s, %s, %s, 'project', %s, %s, 'projects-service')
        """,
        (actor["id"], actor["role"], action, entity_id, Jsonb(changes, dumps=_dumps)),
    )


def _dumps(value: Any) -> str:
    """JSON-encode audit changes, stringifying dates and UUIDs."""
    return json.dumps(value, default=str)


def get_actor(config: str, actor_id: str) -> Optional[dict[str, Any]]:
    """Return the active user acting on the request, or None."""
    with _conn(config).cursor() as cur:
        cur.execute(
            "SELECT id, role, manager_id FROM users WHERE id = %s AND is_archived = false",
            (actor_id,),
        )
        return cur.fetchone()


def get_project(config: str, project_id: str) -> Optional[dict[str, Any]]:
    """Return one project with manager name and allocation count, or None."""
    with _conn(config).cursor() as cur:
        cur.execute(PROJECT_SELECT + " WHERE p.id = %s", (project_id,))
        return cur.fetchone()


def is_allocated(config: str, project_id: str, user_id: str) -> bool:
    """Return True if the user is allocated to the project."""
    with _conn(config).cursor() as cur:
        cur.execute(
            "SELECT 1 FROM project_allocations WHERE project_id = %s AND user_id = %s",
            (project_id, user_id),
        )
        return cur.fetchone() is not None


def list_projects(config: str, actor: dict[str, Any], include_archived: bool) -> list[dict[str, Any]]:
    """
    List projects visible to the actor.

    Admins see everything (archived only on request), managers see their own
    projects, employees see projects they are allocated to.
    """
    where: list[str] = []
    params: list[Any] = []
    if actor["role"] == "manager":
        where.append("p.manager_id = %s")
        params.append(actor["id"])
    elif actor["role"] == "employee":
        where.append("p.id IN (SELECT project_id FROM project_allocations WHERE user_id = %s)")
        params.append(actor["id"])
    if not (actor["role"] == "admin" and include_archived):
        where.append("p.is_archived = false")

    query = PROJECT_SELECT
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY p.created_at DESC"
    with _conn(config).cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def _require_manager(cur: Any, manager_id: str) -> None:
    """Raise ValidationFailure unless manager_id is an active manager."""
    cur.execute(
        "SELECT 1 FROM users WHERE id = %s AND role = 'manager' AND is_archived = false",
        (manager_id,),
    )
    if cur.fetchone() is None:
        raise ValidationFailure({"manager_id": "must reference an active manager"})


def create_project(config: str, actor: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Insert a project and its audit row."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        _require_manager(cur, data["manager_id"])
        try:
            cur.execute(
                """
                INSERT INTO projects (name, description, start_date, end_date,
                                      allocated_hours, budget, manager_id, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    data["name"], data.get("description"), data["start_date"], data["end_date"],
                    data["allocated_hours"], data.get("budget"), data["manager_id"], actor["id"],
                ),
            )
        except UniqueViolation as exc:
            raise ConflictError("A project with that name already exists") from exc
        project_id = cur.fetchone()["id"]
        _audit(cur, actor, "create", project_id, data)
    return get_project(config, str(project_id))


def update_project(config: str, actor: dict[str, Any], project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update editable project fields and write an audit row with the changes."""
    fields = {k: v for k, v in data.items() if k in UPDATABLE_FIELDS}
    if not fields:
        raise ValidationFailure({"body": "no editable fields supplied"})

    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        if "manager_id" in fields:
            _require_manager(cur, fields["manager_id"])
        assignments = ", ".join(f"{name} = %s" for name in fields)
        try:
            cur.execute(
                f"UPDATE projects SET {assignments} WHERE id = %s RETURNING id",
                [*fields.values(), project_id],
            )
        except UniqueViolation as exc:
            raise ConflictError("A project with that name already exists") from exc
        except CheckViolation as exc:
            raise ValidationFailure({"body": "dates, hours or budget violate project constraints"}) from exc
        if cur.fetchone() is None:
            raise NotFoundError("Project not found")
        _audit(cur, actor, "update", project_id, fields)
    return get_project(config, project_id)


def set_archived(config: str, actor: dict[str, Any], project_id: str, archived: bool) -> dict[str, Any]:
    """
    Archive or restore a project.

    Archiving is refused while any non-archived milestone is not completed.
    """
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        if archived:
            cur.execute(
                "SELECT count(*) AS open FROM milestones "
                "WHERE project_id = %s AND is_archived = false AND status <> 'completed'",
                (project_id,),
            )
            if cur.fetchone()["open"] > 0:
                raise ConflictError("All milestones must be completed before archiving")
        cur.execute(
            "UPDATE projects SET is_archived = %s, archived_at = CASE WHEN %s THEN NOW() ELSE NULL END "
            "WHERE id = %s RETURNING id",
            (archived, archived, project_id),
        )
        if cur.fetchone() is None:
            raise NotFoundError("Project not found")
        _audit(cur, actor, "archive" if archived else "restore", project_id, {"is_archived": archived})
    return get_project(config, project_id)


def list_allocations(config: str, project_id: str) -> list[dict[str, Any]]:
    """Return the employees allocated to a project."""
    with _conn(config).cursor() as cur:
        cur.execute(
            """
            SELECT pa.user_id, pa.planned_hours, pa.allocated_at,
                   u.username, u.first_name, u.last_name, u.job_title
            FROM project_allocations pa
            JOIN users u ON u.id = pa.user_id
            WHERE pa.project_id = %s
            ORDER BY u.last_name, u.first_name
            """,
            (project_id,),
        )
        return cur.fetchall()


def add_allocation(config: str, actor: dict[str, Any], project_id: str, user_id: str, planned_hours: float) -> list[dict[str, Any]]:
    """Allocate an employee to a project; their manager must be the project manager."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT 1 FROM projects WHERE id = %s", (project_id,))
        if cur.fetchone() is None:
            raise NotFoundError("Project not found")
        cur.execute(
            "SELECT role FROM users WHERE id = %s AND is_archived = false", (user_id,)
        )
        user = cur.fetchone()
        if user is None or user["role"] != "employee":
            raise ValidationFailure({"user_id": "must reference an active employee"})
        try:
            cur.execute(
                """
                INSERT INTO project_allocations (project_id, user_id, planned_hours, allocated_by)
                VALUES (%s, %s, %s, %s)
                """,
                (project_id, user_id, planned_hours, actor["id"]),
            )
        except UniqueViolation as exc:
            raise ConflictError("Employee is already allocated to this project") from exc
        except RaiseException as exc:
            raise ValidationFailure({"user_id": "employee's manager must be the project manager"}) from exc
        _audit(cur, actor, "assign_employee", project_id,
               {"user_id": user_id, "planned_hours": planned_hours})
    return list_allocations(config, project_id)


def remove_allocation(config: str, actor: dict[str, Any], project_id: str, user_id: str) -> list[dict[str, Any]]:
    """Remove an employee allocation unless they hold active milestone assignments."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM milestone_assignments ma
            JOIN milestones m ON m.id = ma.milestone_id
            WHERE m.project_id = %s AND ma.user_id = %s
              AND ma.detached_at IS NULL AND m.is_archived = false
            """,
            (project_id, user_id),
        )
        if cur.fetchone() is not None:
            raise ConflictError("Employee still has active milestone assignments on this project")
        cur.execute(
            "DELETE FROM project_allocations WHERE project_id = %s AND user_id = %s RETURNING id",
            (project_id, user_id),
        )
        if cur.fetchone() is None:
            raise NotFoundError("Allocation not found")
        _audit(cur, actor, "assign_employee", project_id, {"user_id": user_id, "removed": True})
    return list_allocations(config, project_id)
