"""
Auth service: simple email + password login (no tokens).

Routes (relative to the service path):
    POST /login     {email, password}
    POST /password  {user_id, current_password, new_password}
    POST /logout    {actor_id}
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

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 72  # bcrypt ignores everything past 72 bytes
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
INVALID_CREDENTIALS = {"error": "Invalid email or password"}


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


def _text(body: dict[str, Any], field: str, max_length: int) -> str:
    """Return a non-empty string field or raise a 400."""
    value = body.get(field)
    if not isinstance(value, str) or not value or len(value) > max_length:
        raise HttpError(400, {"error": "Validation failed", "fields": {field: "required"}})
    return value


def validate_new_password(new_password: str, current_password: str) -> Optional[str]:
    """Return an error message if the new password is unacceptable, else None."""
    if len(new_password) < MIN_PASSWORD_LENGTH:
        return f"must be at least {MIN_PASSWORD_LENGTH} characters"
    if len(new_password) > MAX_PASSWORD_LENGTH:
        return f"must be at most {MAX_PASSWORD_LENGTH} characters"
    if new_password == current_password:
        return "must differ from the current password"
    return None


def _route(event: dict[str, Any]) -> dict[str, Any]:
    """Dispatch the request to the matching operation."""
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    segments = [s for s in event.get("rawPath", "/").split("/") if s]
    if "auth" in segments:
        segments = segments[segments.index("auth") + 1:]
    if method != "POST" or len(segments) != 1:
        raise HttpError(404, {"error": "Route not found"})

    body = _parse_body(event)
    route = segments[0]

    if route == "login":
        user = db.login(PG_CONFIG, _text(body, "email", 255), _text(body, "password", MAX_PASSWORD_LENGTH))
        if user is None:
            raise HttpError(401, INVALID_CREDENTIALS)
        return _response(200, {"user": user})

    if route == "password":
        user_id = _text(body, "user_id", 36)
        if not UUID_RE.match(user_id):
            raise HttpError(400, {"error": "Validation failed", "fields": {"user_id": "must be a UUID"}})
        current = _text(body, "current_password", MAX_PASSWORD_LENGTH)
        new = _text(body, "new_password", 1000)
        problem = validate_new_password(new, current)
        if problem:
            raise HttpError(400, {"error": "Validation failed", "fields": {"new_password": problem}})
        user = db.change_password(PG_CONFIG, user_id, current, new)
        if user is None:
            raise HttpError(401, {"error": "Current password is incorrect"})
        return _response(200, {"user": user})

    if route == "logout":
        actor_id = body.get("actor_id")
        if not isinstance(actor_id, str) or not UUID_RE.match(actor_id) or not db.logout(PG_CONFIG, actor_id):
            raise HttpError(401, {"error": "Unknown or inactive user"})
        return _response(200, {"ok": True})

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
    except Exception:
        logger.exception("auth handler error")
        db.reset_connection()
        return _response(500, {"error": "Internal server error"})
