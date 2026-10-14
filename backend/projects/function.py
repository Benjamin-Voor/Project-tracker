"""
Projects service: project CRUD, archive/restore and employee allocation.

The client sends only `actor_id`; the role is looked up in the database.
"""

import base64
import json
import logging
import os
import re
from datetime import date
from typing import Any, Optional

import postgres_service as db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER', 'test')} "
    f"password={os.getenv('POSTGRES_PASS', 'test')} "
    f"dbname={os.getenv('POSTGRES_NAME', 'test')} "
    f"connect_timeout=15"
)

STATUSES = ("not_started", "in_progress", "completed", "abandoned")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class HttpError(Exception):
    """Raised to short-circuit a request with a specific status and body."""

    def __init__(self, status: int, body: dict[str, Any]) -> None:
        super().__init__(body.get("error", ""))
        self.status = status
        self.body = body


def _response(status: int, body: Any) -> dict[str, Any]:
    """Build a Lambda Function URL JSON response."""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def _parse_body(event: dict[str, Any]) -> dict[str, Any]:
    """Decode the JSON request body or raise a 400."""
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = None
    if not isinstance(parsed, dict):
        raise HttpError(400, {"error": "Body must be a JSON object"})
    return parsed


def _is_uuid(value: Any) -> bool:
    """Return True if value is a UUID string."""
    return isinstance(value, str) and bool(UUID_RE.match(value))


def _parse_date(value: Any) -> Optional[date]:
    """Parse an ISO date string, returning None if invalid."""
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def validate_project(data: dict[str, Any], partial: bool) -> tuple[dict[str, Any], dict[str, str]]:
    """
    Validate and normalize project input.

    Args:
        data: Raw request fields.
        partial: When True (edit), only supplied fields are checked.

    Returns:
        A (clean_data, errors) tuple; errors maps field name to message.
    """
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}

    def present(field: str) -> bool:
        return field in data

    if present("name") or not partial:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            errors["name"] = "required"
        elif len(name.strip()) > 255:
            errors["name"] = "must be at most 255 characters"
        else:
            clean["name"] = name.strip()

    if present("description"):
        description = data.get("description")
        if description is not None and not isinstance(description, str):
            errors["description"] = "must be text"
        else:
            clean["description"] = (description or "").strip() or None

    for field in ("start_date", "end_date"):
        if present(field) or not partial:
            parsed = _parse_date(data.get(field))
            if parsed is None:
                errors[field] = "must be a date (YYYY-MM-DD)"
            else:
                clean[field] = parsed
    if "start_date" in clean and "end_date" in clean and clean["end_date"] < clean["start_date"]:
        errors["end_date"] = "must not be before start_date"

    if present("allocated_hours") or not partial:
        hours = data.get("allocated_hours")
        if isinstance(hours, bool) or not isinstance(hours, int) or hours < 0:
            errors["allocated_hours"] = "must be a non-negative integer"
        else:
            clean["allocated_hours"] = hours

    if present("budget"):
        budget = data.get("budget")
        if budget in (None, ""):
            clean["budget"] = None
        else:
            try:
                clean["budget"] = float(budget)
                if clean["budget"] < 0:
                    raise ValueError
            except (TypeError, ValueError):
                errors["budget"] = "must be a non-negative number"

    if present("status"):
        if data["status"] not in STATUSES:
            errors["status"] = f"must be one of {', '.join(STATUSES)}"
        else:
            clean["status"] = data["status"]

    if present("manager_id") or not partial:
        if not _is_uuid(data.get("manager_id")):
            errors["manager_id"] = "required"
        else:
            clean["manager_id"] = data["manager_id"]

    return clean, errors


def _require_actor(params: dict[str, str]) -> dict[str, Any]:
    """Resolve the acting user from actor_id or raise 401."""
    actor_id = params.get("actor_id")
    actor = db.get_actor(PG_CONFIG, actor_id) if _is_uuid(actor_id) else None
    if actor is None:
        raise HttpError(401, {"error": "Unknown or inactive acting user"})
    return actor


def _can_manage(actor: dict[str, Any], project: dict[str, Any]) -> bool:
    """Admins manage any project; managers manage their own."""
    return actor["role"] == "admin" or (
        actor["role"] == "manager" and str(project["manager_id"]) == str(actor["id"])
    )


def _load_project(project_id: str) -> dict[str, Any]:
    """Fetch a project or raise 404."""
    if not _is_uuid(project_id):
        raise HttpError(404, {"error": "Project not found"})
    project = db.get_project(PG_CONFIG, project_id)
    if project is None:
        raise HttpError(404, {"error": "Project not found"})
    return project


def _forbid(message: str = "Not allowed for this role") -> HttpError:
    """Build a 403 error."""
    return HttpError(403, {"error": message})


def _route(event: dict[str, Any]) -> dict[str, Any]:
    """Dispatch the request to the matching operation."""
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    segments = [s for s in event.get("rawPath", "/").split("/") if s]
    if "projects" in segments:
        segments = segments[segments.index("projects") + 1:]
    params = event.get("queryStringParameters") or {}
    actor = _require_actor(params)

    if not segments:
        if method == "GET":
            include_archived = params.get("include_archived") == "true"
            return _response(200, {"projects": db.list_projects(PG_CONFIG, actor, include_archived)})
        if method == "POST":
            if actor["role"] != "admin":
                raise _forbid("Only admins can create projects")
            clean, errors = validate_project(_parse_body(event), partial=False)
            if errors:
                raise HttpError(400, {"error": "Validation failed", "fields": errors})
            return _response(201, {"project": db.create_project(PG_CONFIG, actor, clean)})
        raise HttpError(405, {"error": f"Method {method} not allowed"})

    project = _load_project(segments[0])
    project_id = str(project["id"])
    sub = segments[1:]
    can_manage = _can_manage(actor, project)
    can_view = can_manage or (
        actor["role"] == "employee" and db.is_allocated(PG_CONFIG, project_id, str(actor["id"]))
    )
    if project["is_archived"] and actor["role"] != "admin":
        raise HttpError(404, {"error": "Project not found"})
    if not can_view:
        raise _forbid("You do not have access to this project")

    if not sub:
        if method == "GET":
            return _response(200, {"project": project})
        if method in ("PATCH", "PUT"):
            if not can_manage:
                raise _forbid("Only the project's manager or an admin can edit it")
            clean, errors = validate_project(_parse_body(event), partial=True)
            if "manager_id" in clean and actor["role"] != "admin":
                errors["manager_id"] = "only admins can change the project manager"
            if errors:
                raise HttpError(400, {"error": "Validation failed", "fields": errors})
            return _response(200, {"project": db.update_project(PG_CONFIG, actor, project_id, clean)})
        raise HttpError(405, {"error": f"Method {method} not allowed"})

    if sub == ["archive"] and method == "POST":
        if not can_manage:
            raise _forbid("Only the project's manager or an admin can archive it")
        return _response(200, {"project": db.set_archived(PG_CONFIG, actor, project_id, True)})

    if sub == ["restore"] and method == "POST":
        if actor["role"] != "admin":
            raise _forbid("Only admins can restore projects")
        return _response(200, {"project": db.set_archived(PG_CONFIG, actor, project_id, False)})

    if sub[0] == "allocations":
        if len(sub) == 1 and method == "GET":
            return _response(200, {"allocations": db.list_allocations(PG_CONFIG, project_id)})
        if not can_manage:
            raise _forbid("Only the project's manager or an admin can change allocations")
        if len(sub) == 1 and method == "POST":
            body = _parse_body(event)
            errors: dict[str, str] = {}
            if not _is_uuid(body.get("user_id")):
                errors["user_id"] = "required"
            hours = body.get("planned_hours")
            try:
                hours = float(hours)
                if hours < 0:
                    raise ValueError
            except (TypeError, ValueError):
                errors["planned_hours"] = "must be a non-negative number"
            if errors:
                raise HttpError(400, {"error": "Validation failed", "fields": errors})
            return _response(201, {"allocations": db.add_allocation(
                PG_CONFIG, actor, project_id, body["user_id"], hours)})
        if len(sub) == 2 and method == "DELETE" and _is_uuid(sub[1]):
            return _response(200, {"allocations": db.remove_allocation(
                PG_CONFIG, actor, project_id, sub[1])})

    raise HttpError(404, {"error": "Route not found"})


def handler(event: Optional[dict[str, Any]] = None, context: Any = None) -> dict[str, Any]:
    """
    Entry point for Lambda Function URL requests.

    Args:
        event: Lambda Function URL event.
        context: Lambda context (unused).

    Returns:
        A response dict with statusCode, headers and a JSON body.
    """
    try:
        return _route(event or {})
    except HttpError as exc:
        return _response(exc.status, exc.body)
    except db.ValidationFailure as exc:
        return _response(400, {"error": "Validation failed", "fields": exc.fields})
    except db.NotFoundError as exc:
        return _response(404, {"error": str(exc)})
    except db.ConflictError as exc:
        return _response(409, {"error": str(exc)})
    except Exception:
        logger.exception("projects handler error")
        db.reset_connection()
        return _response(500, {"error": "Internal server error"})
