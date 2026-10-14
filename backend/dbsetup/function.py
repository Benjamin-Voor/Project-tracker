"""
Database setup: applies schema.sql and seeds the first admin.

Aurora is only reachable from inside the VPC, so this runs as a Lambda.
It only accepts direct invocation (aws lambda invoke); requests through the
Function URL or CloudFront carry a requestContext and are refused.

Payload:
    {"admin_password": "<temporary password>"}   # optional; omit to only apply the schema

schema.sql is a copy of db/schema.sql; re-copy it after changing the schema.
"""

import logging
import os
from pathlib import Path
from typing import Any, Optional

from psycopg import connect

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

SCHEMA_SQL = Path(__file__).with_name("schema.sql").read_text()

# Same row as db/seed-admin.sql; does nothing if admin1 or the email exists.
SEED_ADMIN_SQL = """
INSERT INTO users (username, first_name, last_name, email, password_hash, role, must_change_password)
VALUES ('admin1', 'System', 'Admin', 'admin@example.com',
        crypt(%s, gen_salt('bf')), 'admin', true)
ON CONFLICT DO NOTHING
"""


def handler(event: Optional[dict[str, Any]] = None, context: Any = None) -> dict[str, Any]:
    """Apply the schema and optionally seed admin1."""
    event = event or {}
    if "requestContext" in event:
        return {"statusCode": 404, "body": '{"error": "Not found"}'}

    with connect(PG_CONFIG, autocommit=True) as conn:
        conn.execute(SCHEMA_SQL)
        logger.info("Schema applied")
        seeded = False
        password = event.get("admin_password")
        if isinstance(password, str) and len(password) >= 8:
            seeded = conn.execute(SEED_ADMIN_SQL, (password,)).rowcount == 1
        admins = conn.execute(
            "SELECT username FROM users WHERE role = 'admin' ORDER BY username"
        ).fetchall()

    return {"schema": "applied", "admin1_created": seeded, "admins": [a[0] for a in admins]}
