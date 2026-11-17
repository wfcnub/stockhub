"""Shared fixtures.

Unit tests never open a DB connection: engines are lazy, so a syntactically valid PostgreSQL
URL pointing at a closed port is enough. Integration tests (marker `pg`) need a real
PostgreSQL 18 server given by TEST_DATABASE_URL; each test gets its own scratch database,
created and dropped around it, so a dev or CI database is never modified.
"""

import os
import uuid
from collections.abc import Iterator

import pytest

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://stockhub:unused@127.0.0.1:1/stockhub_unit"
)

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import URL, make_url  # noqa: E402

from app.config import _normalize_database_url  # noqa: E402


def _server_url() -> URL:
    raw = os.environ.get("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TEST_DATABASE_URL not set: PostgreSQL integration tests skipped")
    return make_url(_normalize_database_url(raw))


@pytest.fixture
def scratch_db_url() -> Iterator[str]:
    server = _server_url()
    name = f"stockhub_test_{uuid.uuid4().hex[:12]}"
    admin = create_engine(server, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
        yield server.set(database=name).render_as_string(hide_password=False)
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()
