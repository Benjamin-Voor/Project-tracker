"""
PostgreSQL data access for the projects service.

Every mutation writes its audit_log row in the same transaction.
"""

import json
from datetime import date
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
             WHERE te.project_id = p.id) AS logged_hours,
           (SELECT count(*) FROM milestones mo
             WHERE mo.project_id = p.id AND mo.is_archived = false
               AND mo.status <> 'completed' AND mo.end_date < CURRENT_DATE)
               AS overdue_milestones,
           (SELECT count(*) FROM milestones mo
             WHERE mo.project_id = p.id AND mo.is_archived = false) AS milestone_count,
           (SELECT count(*) FROM milestones mo
             WHERE mo.project_id = p.id AND mo.is_archived = false
               AND mo.status = 'completed') AS completed_milestones
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
        project = cur.fetchone()
    return add_risk(project) if project else None


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
        return [add_risk(project) for project in cur.fetchall()]


def _require_manager(cur: Any, manager_id: str) -> None:
    """Raise ValidationFailure unless manager_id is an active manager."""
    cur.execute(
        "SELECT 1 FROM users WHERE id = %s AND role = 'manager' AND is_archived = false",
        (manager_id,),
    )
    if cur.fetchone() is None:
        raise ValidationFailure({"manager_id": "must reference an active manager"})


def _milestones_outside_project(cur: Any, project_id: str, milestone_id: Optional[str] = None) -> dict[str, str]:
    """Return field errors when active milestones are planned outside the project's dates.

    Only planned dates are checked; actual dates may run past the project end.
    Pass milestone_id to check just that milestone.
    """
    query = (
        "SELECT m.name, m.start_date < p.start_date AS early, m.end_date > p.end_date AS late "
        "FROM milestones m JOIN projects p ON p.id = m.project_id "
        "WHERE m.project_id = %s AND m.is_archived = false "
        "AND (m.start_date < p.start_date OR m.end_date > p.end_date)"
    )
    params: list[Any] = [project_id]
    if milestone_id:
        query += " AND m.id = %s"
        params.append(milestone_id)
    cur.execute(query + " ORDER BY m.sequence_number", params)
    rows = cur.fetchall()
    errors = {}
    early = [r["name"] for r in rows if r["early"]]
    late = [r["name"] for r in rows if r["late"]]
    if milestone_id:
        if early:
            errors["start_date"] = "must not be before the project start date"
        if late:
            errors["end_date"] = "must not be after the project end date"
    else:
        if early:
            errors["start_date"] = f"milestones start before this date: {', '.join(early)}"
        if late:
            errors["end_date"] = f"milestones end after this date: {', '.join(late)}"
    return errors


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
        if "start_date" in fields or "end_date" in fields:
            errors = _milestones_outside_project(cur, project_id)
            if errors:
                raise ValidationFailure(errors)
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
    """Return a project's active milestones in sequence order, with current assignees and the ids
    of the active milestones each one depends on (`depends_on`)."""
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
                       AS assignees,
                   (SELECT COALESCE(json_agg(d.depends_on_milestone_id ORDER BY dm.sequence_number), '[]')
                    FROM milestone_dependencies d
                    JOIN milestones dm ON dm.id = d.depends_on_milestone_id AND dm.is_archived = false
                    WHERE d.milestone_id = m.id) AS depends_on
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
        errors = _milestones_outside_project(cur, project_id, milestone_id)
        if errors:
            raise ValidationFailure(errors)
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
        if "start_date" in fields or "end_date" in fields:
            errors = _milestones_outside_project(cur, project_id, milestone_id)
            if errors:
                raise ValidationFailure(errors)
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


def list_dependencies(config: str, project_id: str) -> list[dict[str, Any]]:
    """Return the dependency links between a project's active milestones."""
    with _conn(config).cursor() as cur:
        cur.execute(
            """
            SELECT d.id, d.milestone_id, m.name AS milestone_name,
                   d.depends_on_milestone_id, dm.name AS depends_on_name
            FROM milestone_dependencies d
            JOIN milestones m ON m.id = d.milestone_id AND m.is_archived = false
            JOIN milestones dm ON dm.id = d.depends_on_milestone_id AND dm.is_archived = false
            WHERE m.project_id = %s
            ORDER BY m.sequence_number, dm.sequence_number
            """,
            (project_id,),
        )
        return cur.fetchall()


def _creates_cycle(cur: Any, milestone_id: str, depends_on_id: str) -> bool:
    """Return True if depends_on_id already (transitively) depends on milestone_id.

    Only links between active milestones count.
    """
    cur.execute(
        """
        WITH RECURSIVE chain(id) AS (
            SELECT %s::uuid
            UNION
            SELECT d.depends_on_milestone_id
            FROM milestone_dependencies d
            JOIN chain c ON d.milestone_id = c.id
            JOIN milestones dm ON dm.id = d.depends_on_milestone_id AND dm.is_archived = false
        )
        SELECT 1 FROM chain WHERE id = %s::uuid
        """,
        (depends_on_id, milestone_id),
    )
    return cur.fetchone() is not None


def add_dependency(config: str, actor: dict[str, Any], project_id: str, milestone_id: str, depends_on_id: str) -> list[dict[str, Any]]:
    """Record that milestone_id cannot finish before depends_on_id (same project, no cycles)."""
    field = "depends_on_milestone_id"
    if milestone_id == depends_on_id:
        raise ValidationFailure({field: "a milestone cannot depend on itself"})
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT project_id FROM milestones WHERE id = %s AND is_archived = false",
            (depends_on_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValidationFailure({field: "milestone not found"})
        if str(row["project_id"]) != str(project_id):
            raise ValidationFailure({field: "must be a milestone of the same project"})
        if _creates_cycle(cur, milestone_id, depends_on_id):
            raise ValidationFailure({field: "would create a circular dependency"})
        try:
            cur.execute(
                "INSERT INTO milestone_dependencies (milestone_id, depends_on_milestone_id) "
                "VALUES (%s, %s) RETURNING id",
                (milestone_id, depends_on_id),
            )
        except UniqueViolation as exc:
            raise ConflictError("This dependency already exists") from exc
        except CheckViolation as exc:
            raise ValidationFailure({field: "a milestone cannot depend on itself"}) from exc
        except RaiseException as exc:
            raise ValidationFailure({field: "must be a milestone of the same project"}) from exc
        _audit(cur, actor, "update", milestone_id, {field: depends_on_id}, "milestone")
    return list_milestones(config, project_id)


def remove_dependency(config: str, actor: dict[str, Any], project_id: str, milestone_id: str, depends_on_id: str) -> list[dict[str, Any]]:
    """Delete a dependency link (the table has no archive column; the audit row keeps history)."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "DELETE FROM milestone_dependencies "
            "WHERE milestone_id = %s AND depends_on_milestone_id = %s RETURNING id",
            (milestone_id, depends_on_id),
        )
        if cur.fetchone() is None:
            raise NotFoundError("Dependency not found")
        _audit(cur, actor, "update", milestone_id,
               {"depends_on_milestone_id": depends_on_id, "removed": True}, "milestone")
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


# --- Risk and workload (dashboard) -------------------------------------------

INACTIVE_PROJECT_STATUSES = ("completed", "abandoned")
HOURS_PER_WORKING_DAY = 8


RISK_THRESHOLD = 0.75


def add_risk(project: dict[str, Any]) -> dict[str, Any]:
    """
    Add `is_late`, `at_risk` (bools), `progress` and `risk_reasons` to a project row.

    Only active projects (not archived, not completed or abandoned) are flagged.
    Late: today is past the end date, so the deadline is already missed.
    At risk (deadline still ahead): at least 75% of the project's time has passed
    but fewer than 75% of its active milestones are completed (no milestones
    counts as 0% done), or any active, not-completed milestone is past its
    planned end date.
    """
    reasons: list[str] = []
    total = int(project.get("milestone_count") or 0)
    done = int(project.get("completed_milestones") or 0)
    progress = done / total if total else 0.0
    project["progress"] = round(progress, 2)
    late = at_risk = False
    if not project["is_archived"] and project["status"] not in INACTIVE_PROJECT_STATUSES:
        today = date.today()
        start, end = project["start_date"], project["end_date"]
        overdue = int(project.get("overdue_milestones") or 0)
        if end < today:
            late = True
            reasons.append(f"Missed end date {end.isoformat()}")
        else:
            elapsed = (today - start).days / max((end - start).days, 1)
            if elapsed >= RISK_THRESHOLD and progress < RISK_THRESHOLD:
                at_risk = True
                reasons.append(
                    f"{min(elapsed, 1):.0%} of time used, {done} of {total} milestones done"
                )
            if overdue:
                at_risk = True
        if overdue:
            reasons.append(f"{overdue} overdue milestone{'s' if overdue != 1 else ''}")
    project["is_late"] = late
    project["at_risk"] = at_risk
    project["risk_reasons"] = reasons
    return project


def workload_report(config: str, actor: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Return each visible employee's allocated hours across active projects.

    Admins see every active employee, managers see their own team, employees
    see only themselves. Active projects are not archived and not completed or
    abandoned. Capacity is 8 hours per working day (Monday to Friday) across
    the union of the employee's active project date ranges; an employee is
    over-allocated when allocated hours exceed that capacity.
    """
    where = ["u.is_archived = false", "u.role = 'employee'"]
    params: list[Any] = []
    if actor["role"] == "manager":
        where.append("u.manager_id = %s")
        params.append(actor["id"])
    elif actor["role"] == "employee":
        where.append("u.id = %s")
        params.append(actor["id"])
    query = f"""
        WITH active AS (
            SELECT pa.user_id, pa.allocated_hours, p.id AS project_id, p.name,
                   p.start_date, p.end_date
            FROM project_allocations pa
            JOIN projects p ON p.id = pa.project_id
            WHERE p.is_archived = false AND p.status NOT IN ('completed', 'abandoned')
        ),
        capacity AS (
            SELECT a.user_id, count(DISTINCT d.day) AS working_days
            FROM active a
            CROSS JOIN LATERAL generate_series(a.start_date, a.end_date, interval '1 day') AS d(day)
            WHERE extract(isodow FROM d.day) < 6
            GROUP BY a.user_id
        )
        SELECT u.id AS user_id, u.first_name || ' ' || u.last_name AS name, u.email,
               u.manager_id, m.first_name || ' ' || m.last_name AS manager_name,
               COALESCE((SELECT SUM(a.allocated_hours) FROM active a WHERE a.user_id = u.id), 0)::float
                   AS allocated_hours,
               (COALESCE(c.working_days, 0) * {HOURS_PER_WORKING_DAY})::float AS capacity_hours,
               COALESCE((SELECT json_agg(json_build_object(
                            'project_id', a.project_id, 'name', a.name,
                            'start_date', a.start_date, 'end_date', a.end_date,
                            'allocated_hours', a.allocated_hours::float) ORDER BY a.start_date)
                         FROM active a WHERE a.user_id = u.id), '[]'::json) AS projects
        FROM users u
        LEFT JOIN users m ON m.id = u.manager_id
        LEFT JOIN capacity c ON c.user_id = u.id
        WHERE {" AND ".join(where)}
        ORDER BY u.last_name, u.first_name
    """
    with _conn(config).cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    for row in rows:
        row["project_count"] = len(row["projects"])
        row["over_allocated"] = row["allocated_hours"] > row["capacity_hours"]
    return rows
