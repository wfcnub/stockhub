from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_cors_origins_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, http://127.0.0.1:3000")
    assert Settings(_env_file=None).CORS_ORIGINS == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_cors_origins_single_value(monkeypatch: pytest.MonkeyPatch) -> None:
    # docker-compose.yml sets a single bare origin.
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    assert Settings(_env_file=None).CORS_ORIGINS == ["http://localhost:3000"]


def test_cors_origins_json_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", '["http://a.test", "http://b.test"]')
    assert Settings(_env_file=None).CORS_ORIGINS == ["http://a.test", "http://b.test"]


def test_env_file_written_by_start_sh_loads(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Same shape as the .env that start.sh writes, including keys the backend did not know.
    for key in ("DATABASE_URL", "CORS_ORIGINS", "ACTIVE_EXCHANGES"):
        monkeypatch.delenv(key, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DATABASE_URL=postgresql://stockhub:pw@localhost:5432/stockhub\n"
        "CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000\n"
        "ACTIVE_EXCHANGES=IDX\n"
        "SOME_UNKNOWN_KEY=1\n"
    )
    settings = Settings(_env_file=env_file)
    assert settings.CORS_ORIGINS == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert settings.ACTIVE_EXCHANGES == ["IDX"]


def test_ma_windows_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MA_WINDOWS", "5,20,200")
    assert Settings(_env_file=None).MA_WINDOWS == [5, 20, 200]


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgresql://u:p@db:5432/stockhub", "postgresql+psycopg://u:p@db:5432/stockhub"),
        ("postgres://u:p@db:5432/stockhub", "postgresql+psycopg://u:p@db:5432/stockhub"),
        ("postgresql+psycopg://u:p@db/stockhub", "postgresql+psycopg://u:p@db/stockhub"),
    ],
)
def test_database_url_driver_is_explicit(
    monkeypatch: pytest.MonkeyPatch, given: str, expected: str
) -> None:
    monkeypatch.setenv("DATABASE_URL", given)
    assert Settings(_env_file=None).DATABASE_URL == expected


@pytest.mark.parametrize("url", ["sqlite:///./stockhub.db", "mysql://u:p@db/x", ""])
def test_non_postgres_database_url_is_rejected(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", url)
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(_env_file=None)


def test_database_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None)
