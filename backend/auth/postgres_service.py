"""
PostgreSQL data access for the auth service.

Passwords are verified and hashed in Postgres with pgcrypto (bcrypt).
Every login, failed login, logout and password change is written to audit_log.
"""

import json
from typing import Any, Optional

from psycopg import Connection, connect
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

PG_CONN: Optional[Connection] = None

SESSION_COLUMNS = (
    "id, username, first_name, last_name, email, role, job_title, "
    "manager_id, must_change_password"
)


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
    action: str,
    actor: Optional[dict[str, Any]],
    entity_id: Any,
    changes: dict[str, Any],
) -> None:
    """Append an audit_log row; actor is None for unauthenticated attempts."""
    cur.execute(
        """
        INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, changes, source)
        VALUES (%s, %s, %s, 'user', %s, %s, 'auth-service')
        """,
        (
            actor["id"] if actor else None,
            actor["role"] if actor else None,
            action,
            entity_id,
            Jsonb(changes, dumps=lambda v: json.dumps(v, default=str)),
        ),
    )


def _find_verified(cur: Any, username: str, password: str) -> Optional[dict[str, Any]]:
    """Return the active user whose password matches, or None."""
    cur.execute(
        f"SELECT {SESSION_COLUMNS} FROM users "
        "WHERE username = %s AND is_archived = false "
        "AND password_hash = crypt(%s, password_hash)",
        (username, password),
    )
    return cur.fetchone()


def _record_failure(cur: Any, username: str) -> None:
    """Audit a failed login without storing the attempted password."""
    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
    row = cur.fetchone()
    _audit(cur, "login_failed", None, row["id"] if row else None, {"username": username})


def login(config: str, username: str, password: str) -> Optional[dict[str, Any]]:
    """
    Verify credentials and audit the attempt.

    Returns:
        The session user on success, or None if the credentials are wrong.
    """
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        user = _find_verified(cur, username, password)
        if user is None:
            _record_failure(cur, username)
            return None
        _audit(cur, "login", user, user["id"], {"username": username})
        return user


def change_password(
    config: str, username: str, current_password: str, new_password: str
) -> Optional[dict[str, Any]]:
    """
    Replace a user's password after verifying the current one.

    Clears must_change_password. Returns the updated session user, or None
    if the current credentials are wrong.
    """
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        user = _find_verified(cur, username, current_password)
        if user is None:
            _record_failure(cur, username)
            return None
        cur.execute(
            "UPDATE users SET password_hash = crypt(%s, gen_salt('bf')), "
            f"must_change_password = false WHERE id = %s RETURNING {SESSION_COLUMNS}",
            (new_password, user["id"]),
        )
        updated = cur.fetchone()
        _audit(cur, "update", updated, updated["id"], {"password_changed": True})
        return updated


def logout(config: str, actor_id: str) -> bool:
    """Audit a logout for an active user; returns False if the user is unknown."""
    conn = _conn(config)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT id, role FROM users WHERE id = %s AND is_archived = false", (actor_id,)
        )
        user = cur.fetchone()
        if user is None:
            return False
        _audit(cur, "logout", user, user["id"], {})
        return True
