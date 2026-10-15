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
    SELECT p.id, p.name, p.description, p.start_date, p.end_date,
           p.budget, p.manager_id, p.status, p.is_archived, p.archived_at,
           p.created_by, p.created_at, p.updated_at,
           m.first_name || ' ' || m.last_name AS manager_name,
           (SELECT count(*) FROM project_allocations pa WHERE pa.project_id = p.id)
               AS allocation_count,
           (SELECT COALESCE(SUM(pa.allocated_hours), 0)::float FROM project_allocations pa
             WHERE pa.project_id = p.id) AS allocated_hours,
           (SELECT COALESCE(SUM(te.hours), 0)::float FROM time_entries te
             WHERE te.project_id = p.id) AS logged_hours
    FROM projects p
    JOIN users m ON m.id = p.manager_id
"""

UPDATABLE_FIELDS = (
    "name", "description", "start_date", "end_date",
    "budget", "status", "manager_id",
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


def _audit(
    cur: Any,
    actor: dict[str, Any],
    action: str,
    entity_id: Any,
    changes: dict[str, Any],
    entity_type: str = "project",
) -> None:
    """Append an audit_log row for the acting user."""
    cur.execute(
        """
        INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, changes, source)
        VALUES (%s, %s, %s, %s, %s, %s, 'projects-service')
        """,
        (actor["id"], actor["role"], action, entity_type, entity_id, Jsonb(changes, dumps=_dumps)),
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
                                      budget, manager_id, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    data["name"], data.get("description"), data["start_date"], data["end_date"],
                    data.get("budget"), data["manager_id"], actor["id"],
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
            raise ValidationFailure({"body": "dates or budget violate project constraints"}) from exc
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
            SELECT pa.user_id, pa.allocated_hours, pa.allocated_at,
                   u.email, u.first_name, u.last_name, u.job_title
            FROM project_allocations pa
            JOIN users u ON u.id = pa.user_id
            WHERE pa.project_id = %s
            ORDER BY u.last_name, u.first_name
            """,
            (project_id,),
        )
        return cur.fetchall()


def add_allocation(config: str, actor: dict[str, Any], project_id: str, user_id: str, allocated_hours: float) -> list[dict[str, Any]]:
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
                INSERT INTO project_allocations (project_id, user_id, allocated_hours, allocated_by)
                VALUES (%s, %s, %s, %s)
                """,
                (project_id, user_id, allocated_hours, actor["id"]),
            )
        except UniqueViolation as exc:
            raise ConflictError("Employee is already allocated to this project") from exc
        except RaiseException as exc:
            raise ValidationFailure({"user_id": "employee's manager must be the project manager"}) from exc
        _audit(cur, actor, "assign_employee", project_id,
               {"user_id": user_id, "allocated_hours": allocated_hours})
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


MILESTONE_FIELDS = (
    "name", "goal", "deliverables", "completion_criteria", "start_date", "end_date", "status",
)


def list_milestones(config: str, project_id: str) -> list[dict[str, Any]]:
    """Return a project's active milestones in sequence order, each with its current assignees."""
    with _conn(config).cursor() as cur:
        cur.execute(
            """
            SELECT m.id, m.project_id, m.sequence_number, m.name, m.goal, m.deliverables,
                   m.completion_criteria, m.start_date, m.end_date, m.actual_start_date,
                   m.actual_end_date, m.status, m.completed_at,
                   COALESCE(json_agg(json_build_object(
                       'user_id', u.id,
                       'first_name', u.first_name, 'last_name', u.last_name
                   ) ORDER BY u.last_name, u.first_name) FILTER (WHERE u.id IS NOT NULL), '[]')
                       AS assignees
            FROM milestones m
            LEFT JOIN milestone_assignments ma ON ma.milestone_id = m.id AND ma.detached_at IS NULL
            LEFT JOIN users u ON u.id = ma.user_id
            WHERE m.project_id = %s AND m.is_archived = false
            GROUP BY m.id
            ORDER BY m.sequence_number
            """,
            (project_id,),
        )
        return cur.fetchall()


def get_milestone(config: str, project_id: str, milestone_id: str) -> Optional[dict[str, Any]]:
    """Return an active milestone of the project, or None."""
    with _conn(config).cursor() as cur:
        cur.execute(
            "SELECT id, status, start_date, end_date FROM milestones "
            "WHERE id = %s AND project_id = %s AND is_archived = false",
            (milestone_id, project_id),
        )
        return cur.fetchone()


def _status_dates(fields: dict[str, Any]) -> str:
    """SQL fragment that stamps actual dates when the status changes."""
    if fields.get("status") == "in_progress":
        return ", actual_start_date = COALESCE(actual_start_date, CURRENT_DATE), " \
               "actual_end_date = NULL, completed_at = NULL"
    if fields.get("status") == "completed":
        return ", actual_start_date = COALESCE(actual_start_date, CURRENT_DATE), " \
               "actual_end_date = CURRENT_DATE, completed_at = NOW()"
    if fields.get("status") == "not_started":
        return ", actual_start_date = NULL, actual_end_date = NULL, completed_at = NULL"
    return ""


def create_milestone(config: str, actor: dict[str, Any], project_id: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    """Insert a milestone at the end of the project's sequence."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM milestones WHERE project_id = %s",
            (project_id,),
        )
        sequence = cur.fetchone()["next"]
        cur.execute(
            """
            INSERT INTO milestones (project_id, sequence_number, name, goal, deliverables,
                                    completion_criteria, start_date, end_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                project_id, sequence, data["name"], data.get("goal"), data.get("deliverables"),
                data.get("completion_criteria"), data["start_date"], data["end_date"],
            ),
        )
        milestone_id = cur.fetchone()["id"]
        _audit(cur, actor, "create", milestone_id, {"project_id": project_id, **data}, "milestone")
    return list_milestones(config, project_id)


def update_milestone(config: str, actor: dict[str, Any], project_id: str, milestone_id: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    """Update milestone fields; a status change stamps the actual start/end dates."""
    fields = {k: v for k, v in data.items() if k in MILESTONE_FIELDS}
    if not fields:
        raise ValidationFailure({"body": "no editable fields supplied"})
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        assignments = ", ".join(f"{name} = %s" for name in fields) + _status_dates(fields)
        try:
            cur.execute(
                f"UPDATE milestones SET {assignments} "
                "WHERE id = %s AND project_id = %s AND is_archived = false RETURNING id",
                [*fields.values(), milestone_id, project_id],
            )
        except CheckViolation as exc:
            raise ValidationFailure({"end_date": "must not be before start_date"}) from exc
        if cur.fetchone() is None:
            raise NotFoundError("Milestone not found")
        action = "complete" if fields.get("status") == "completed" else "update"
        _audit(cur, actor, action, milestone_id, fields, "milestone")
    return list_milestones(config, project_id)


def archive_milestone(config: str, actor: dict[str, Any], project_id: str, milestone_id: str) -> list[dict[str, Any]]:
    """Archive a milestone and detach its employees so they can move on."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "UPDATE milestones SET is_archived = true "
            "WHERE id = %s AND project_id = %s AND is_archived = false RETURNING id",
            (milestone_id, project_id),
        )
        if cur.fetchone() is None:
            raise NotFoundError("Milestone not found")
        cur.execute(
            "UPDATE milestone_assignments SET detached_at = NOW() "
            "WHERE milestone_id = %s AND detached_at IS NULL",
            (milestone_id,),
        )
        _audit(cur, actor, "archive", milestone_id, {"detached": cur.rowcount}, "milestone")
    return list_milestones(config, project_id)


def assign_milestone(config: str, actor: dict[str, Any], project_id: str, milestone_id: str, user_id: str) -> list[dict[str, Any]]:
    """Assign an allocated employee to a milestone (re-attaching a detached assignment)."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO milestone_assignments (milestone_id, user_id, assigned_by)
                VALUES (%s, %s, %s)
                ON CONFLICT (milestone_id, user_id)
                DO UPDATE SET detached_at = NULL, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
                WHERE milestone_assignments.detached_at IS NOT NULL
                RETURNING id
                """,
                (milestone_id, user_id, actor["id"]),
            )
        except RaiseException as exc:
            raise ValidationFailure({"user_id": "employee must be allocated to this project"}) from exc
        if cur.fetchone() is None:
            raise ConflictError("Employee is already assigned to this milestone")
        _audit(cur, actor, "assign_employee", milestone_id, {"user_id": user_id}, "milestone")
    return list_milestones(config, project_id)


def unassign_milestone(config: str, actor: dict[str, Any], project_id: str, milestone_id: str, user_id: str) -> list[dict[str, Any]]:
    """Detach an employee from a milestone (the row is kept for history)."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "UPDATE milestone_assignments SET detached_at = NOW() "
            "WHERE milestone_id = %s AND user_id = %s AND detached_at IS NULL RETURNING id",
            (milestone_id, user_id),
        )
        if cur.fetchone() is None:
            raise NotFoundError("Assignment not found")
        _audit(cur, actor, "assign_employee", milestone_id,
               {"user_id": user_id, "removed": True}, "milestone")
    return list_milestones(config, project_id)


def list_time_entries(config: str, project_id: str, user_id: Optional[str]) -> list[dict[str, Any]]:
    """Return a project's time entries, newest first; only one user's when user_id is given."""
    query = """
        SELECT te.id, te.user_id, te.milestone_id, te.work_date, te.hours, te.note, te.created_at,
               u.first_name, u.last_name, m.name AS milestone_name
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN milestones m ON m.id = te.milestone_id
        WHERE te.project_id = %s
    """
    params: list[Any] = [project_id]
    if user_id:
        query += " AND te.user_id = %s"
        params.append(user_id)
    query += " ORDER BY te.work_date DESC, te.created_at DESC"
    with _conn(config).cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def add_time_entry(config: str, actor: dict[str, Any], project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Log the actor's own hours on a project."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        if data.get("milestone_id"):
            cur.execute(
                "SELECT 1 FROM milestones WHERE id = %s AND project_id = %s AND is_archived = false",
                (data["milestone_id"], project_id),
            )
            if cur.fetchone() is None:
                raise ValidationFailure({"milestone_id": "must be an active milestone of this project"})
        cur.execute(
            """
            INSERT INTO time_entries (project_id, milestone_id, user_id, work_date, hours, note)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (project_id, data.get("milestone_id"), actor["id"], data["work_date"], data["hours"], data.get("note")),
        )
        entry_id = cur.fetchone()["id"]
        _audit(cur, actor, "create", entry_id, {"project_id": project_id, **data}, "time_entry")
    return {"id": entry_id}


def list_expenses(config: str, project_id: str) -> list[dict[str, Any]]:
    """Return a project's expenses, newest first."""
    with _conn(config).cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.amount, e.description, e.incurred_on, e.created_at,
                   u.first_name || ' ' || u.last_name AS created_by_name
            FROM expenses e
            LEFT JOIN users u ON u.id = e.created_by
            WHERE e.project_id = %s
            ORDER BY e.incurred_on DESC, e.created_at DESC
            """,
            (project_id,),
        )
        return cur.fetchall()


def add_expense(config: str, actor: dict[str, Any], project_id: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    """Record a project expense."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO expenses (project_id, amount, description, incurred_on, created_by)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (project_id, data["amount"], data["description"], data["incurred_on"], actor["id"]),
        )
        expense_id = cur.fetchone()["id"]
        _audit(cur, actor, "create", expense_id, {"project_id": project_id, **data}, "expense")
    return list_expenses(config, project_id)


def get_budget(config: str, project_id: str) -> dict[str, Any]:
    """
    Return the project's budget summary.

    Actual cost comes from the project_budget_summary view (logged hours at
    salary / 2080 per hour, plus expenses). Planned salary cost uses the
    allocations' allocated hours at the same hourly rate.
    """
    with _conn(config).cursor() as cur:
        cur.execute(
            """
            SELECT b.budget, b.salary_cost, b.expense_cost, b.actual_cost, b.variance,
                   (SELECT COALESCE(SUM(pa.allocated_hours * COALESCE(u.salary, 0) / 2080.0), 0)
                    FROM project_allocations pa JOIN users u ON u.id = pa.user_id
                    WHERE pa.project_id = b.project_id) AS planned_salary_cost,
                   (SELECT COALESCE(SUM(hours), 0) FROM time_entries
                    WHERE project_id = b.project_id) AS logged_hours
            FROM project_budget_summary b
            WHERE b.project_id = %s
            """,
            (project_id,),
        )
        return cur.fetchone()
