"""
Users service backed by PostgreSQL.

Routes (relative to the service path; every request needs `actor_id`):
    GET   /                  list users visible to the actor
    POST  /                  create a user (admin)
    PATCH /{id}              edit a user (self: name/email; manager: own team; admin: anyone)
    POST  /{id}/archive      archive a user (manager: own team; admin: anyone else)
    POST  /{id}/restore      restore a user (admin)
    GET   /audit             audit log (admin)
"""

import base64
import json
import logging
import os
import re
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

ROLES = ("admin", "manager", "employee")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
SELF_FIELDS = ("first_name", "last_name", "email")
TEAM_FIELDS = SELF_FIELDS + ("job_title", "salary")
ADMIN_FIELDS = TEAM_FIELDS + ("manager_id",)


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


def validate_user(data: dict[str, Any], partial: bool = False) -> tuple[dict[str, Any], dict[str, str]]:
    """
    Validate and normalize user input.

    Args:
        data: Raw request fields.
        partial: When True (edit), only supplied fields are checked and
            password/role are not accepted.

    Returns:
        A (clean_data, errors) tuple; errors maps field name to message.
    """
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}

    required = ("first_name", "last_name", "email") if partial else (
        "first_name", "last_name", "email", "password")
    for field in required:
        if partial and field not in data:
            continue
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = "required"
        else:
            clean[field] = value if field == "password" else value.strip()

    if "email" in clean and (len(clean["email"]) > 255 or not EMAIL_RE.match(clean["email"])):
        errors["email"] = "invalid email"
    for field in ("first_name", "last_name"):
        if field in clean and len(clean[field]) > 100:
            errors[field] = "must be at most 100 characters"
    if "password" in clean and len(clean["password"]) < 8:
        errors["password"] = "must be at least 8 characters"

    role = data.get("role")
    if not partial:
        if role not in ROLES:
            errors["role"] = f"must be one of {', '.join(ROLES)}"
        else:
            clean["role"] = role

    if "job_title" in data or not partial:
        job_title = data.get("job_title")
        if job_title in (None, ""):
            clean["job_title"] = None
        elif not isinstance(job_title, str) or len(job_title) > 100:
            errors["job_title"] = "must be at most 100 characters"
        else:
            clean["job_title"] = job_title.strip()

    if "salary" in data or not partial:
        salary = data.get("salary")
        if salary in (None, ""):
            clean["salary"] = None
        else:
            try:
                clean["salary"] = float(salary)
                if clean["salary"] < 0:
                    raise ValueError
            except (TypeError, ValueError):
                errors["salary"] = "must be a non-negative number"

    if partial:
        if "manager_id" in data:
            if not _is_uuid(data["manager_id"]):
                errors["manager_id"] = "must be a manager"
            else:
                clean["manager_id"] = data["manager_id"]
    elif role == "employee":
        if not _is_uuid(data.get("manager_id")):
            errors["manager_id"] = "required for employees"
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


def _load_user(user_id: str) -> dict[str, Any]:
    """Fetch a user (archived included) or raise 404."""
    user = db.get_user(PG_CONFIG, user_id) if _is_uuid(user_id) else None
    if user is None:
        raise HttpError(404, {"error": "User not found"})
    return user


def _manages(actor: dict[str, Any], user: dict[str, Any]) -> bool:
    """True if the actor is a manager and the user is on their team."""
    return actor["role"] == "manager" and str(user["manager_id"]) == str(actor["id"])


def _route(event: dict[str, Any]) -> dict[str, Any]:
    """Dispatch the request to the matching operation."""
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    segments = [s for s in event.get("rawPath", "/").split("/") if s]
    if "users" in segments:
        segments = segments[segments.index("users") + 1:]
    params = event.get("queryStringParameters") or {}
    actor = _require_actor(params)
    is_admin = actor["role"] == "admin"

    if not segments:
        if method == "GET":
            include_archived = params.get("include_archived") == "true"
            return _response(200, {"users": db.list_users(PG_CONFIG, actor, include_archived)})
        if method == "POST":
            if not is_admin:
                raise HttpError(403, {"error": "Only admins can create users"})
            clean, errors = validate_user(_parse_body(event))
            if errors:
                raise HttpError(400, {"error": "Validation failed", "fields": errors})
            return _response(201, {"user": db.create_user(PG_CONFIG, actor, clean)})
        raise HttpError(405, {"error": f"Method {method} not allowed"})

    if segments == ["audit"] and method == "GET":
        if not is_admin:
            raise HttpError(403, {"error": "Only admins can view the audit log"})
        entity_type = params.get("entity_type") or None
        try:
            limit = min(max(int(params.get("limit", 200)), 1), 1000)
        except ValueError:
            limit = 200
        return _response(200, {"entries": db.list_audit(PG_CONFIG, entity_type, limit)})

    user = _load_user(segments[0])
    user_id = str(user["id"])
    is_self = user_id == str(actor["id"])
    sub = segments[1:]

    if not sub and method in ("PATCH", "PUT"):
        if is_admin:
            allowed = ADMIN_FIELDS
        elif _manages(actor, user):
            allowed = TEAM_FIELDS
        elif is_self:
            allowed = SELF_FIELDS
        else:
            raise HttpError(403, {"error": "You can only edit yourself or your own team"})
        if user["is_archived"]:
            raise HttpError(409, {"error": "User is archived"})
        data = _parse_body(event)
        clean, errors = validate_user(data, partial=True)
        for field in clean:
            if field not in allowed:
                errors[field] = "you cannot change this field"
        if "manager_id" in clean and user["role"] != "employee":
            errors["manager_id"] = "only employees have a manager"
        if errors:
            raise HttpError(400, {"error": "Validation failed", "fields": errors})
        return _response(200, {"user": db.update_user(PG_CONFIG, actor, user_id, clean)})

    if sub == ["archive"] and method == "POST":
        if is_self:
            raise HttpError(409, {"error": "You cannot archive yourself"})
        if not (is_admin or _manages(actor, user)):
            raise HttpError(403, {"error": "Only admins or the employee's manager can archive them"})
        return _response(200, {"user": db.set_user_archived(PG_CONFIG, actor, user_id, True)})

    if sub == ["restore"] and method == "POST":
        if not is_admin:
            raise HttpError(403, {"error": "Only admins can restore users"})
        return _response(200, {"user": db.set_user_archived(PG_CONFIG, actor, user_id, False)})

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
    except db.DuplicateUserError as exc:
        return _response(409, {"error": str(exc)})
    except db.ConflictError as exc:
        return _response(409, {"error": str(exc)})
    except db.InvalidManagerError as exc:
        return _response(400, {"error": "Validation failed", "fields": {"manager_id": str(exc)}})
    except Exception:
        logger.exception("users handler error")
        db.reset_connection()
        return _response(500, {"error": "Internal server error"})
