"""
Users service: list users (GET) and create a user (POST) backed by PostgreSQL.
"""

import base64
import json
import logging
import os
import re
from typing import Any, Optional

from postgres_service import (
    DuplicateUserError,
    InvalidManagerError,
    create_user,
    list_users,
)

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


def _response(status: int, body: Any) -> dict[str, Any]:
    """Build a Lambda Function URL JSON response."""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def _parse_body(event: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Decode the JSON request body, returning None if it is not a JSON object."""
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        parsed = json.loads(raw)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def validate_user(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """
    Validate and normalize a create-user payload.

    Returns:
        A (clean_data, errors) tuple; errors maps field name to message.
    """
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}

    for field in ("username", "first_name", "last_name", "email", "password"):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = "required"
        else:
            clean[field] = value if field == "password" else value.strip()

    if "username" in clean and len(clean["username"]) != 6:
        errors["username"] = "must be exactly 6 characters"
    if "email" in clean and (len(clean["email"]) > 255 or not EMAIL_RE.match(clean["email"])):
        errors["email"] = "invalid email"
    for field in ("first_name", "last_name"):
        if field in clean and len(clean[field]) > 100:
            errors[field] = "must be at most 100 characters"

    role = data.get("role")
    if role not in ROLES:
        errors["role"] = f"must be one of {', '.join(ROLES)}"
    else:
        clean["role"] = role

    job_title = data.get("job_title")
    if job_title not in (None, ""):
        if not isinstance(job_title, str) or len(job_title) > 100:
            errors["job_title"] = "must be at most 100 characters"
        else:
            clean["job_title"] = job_title.strip()

    salary = data.get("salary")
    if salary not in (None, ""):
        try:
            clean["salary"] = float(salary)
            if clean["salary"] < 0:
                raise ValueError
        except (TypeError, ValueError):
            errors["salary"] = "must be a non-negative number"

    manager_id = data.get("manager_id")
    if role == "employee":
        if not isinstance(manager_id, str) or not UUID_RE.match(manager_id):
            errors["manager_id"] = "required for employees"
        else:
            clean["manager_id"] = manager_id

    return clean, errors


def handler(event: Optional[dict[str, Any]] = None, context: Any = None) -> dict[str, Any]:
    """
    Route GET (list users) and POST (create user) requests.

    Args:
        event: Lambda Function URL event.
        context: Lambda context (unused).

    Returns:
        A response dict with statusCode, headers and a JSON body.
    """
    event = event or {}
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()

    try:
        if method == "GET":
            params = event.get("queryStringParameters") or {}
            include_archived = params.get("include_archived") == "true"
            return _response(200, {"users": list_users(PG_CONFIG, include_archived)})

        if method == "POST":
            data = _parse_body(event)
            if data is None:
                return _response(400, {"error": "Body must be a JSON object"})
            clean, errors = validate_user(data)
            if errors:
                return _response(400, {"error": "Validation failed", "fields": errors})
            return _response(201, {"user": create_user(PG_CONFIG, clean)})

        return _response(405, {"error": f"Method {method} not allowed"})
    except DuplicateUserError as exc:
        return _response(409, {"error": str(exc)})
    except InvalidManagerError as exc:
        return _response(400, {"error": "Validation failed", "fields": {"manager_id": str(exc)}})
    except Exception:
        logger.exception("users handler error")
        return _response(500, {"error": "Internal server error"})
