import json
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _parse_list(value: Any) -> Any:
    """Accept a JSON list or a comma-separated string for list settings from env/.env."""
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            return json.loads(text)
        return [part.strip() for part in text.split(",") if part.strip()]
    return value


def _normalize_database_url(url: str) -> str:
    """Make the PostgreSQL driver explicit (psycopg 3). PostgreSQL is the only supported DB."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    if url.startswith("postgresql+psycopg://"):
        return url
    raise ValueError(
        "DATABASE_URL must be a PostgreSQL URL (postgresql://... or postgresql+psycopg://...)"
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database: required, PostgreSQL only (no default, so a missing setting fails loudly)
    DATABASE_URL: str

    # CORS settings for frontend
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

    # Active exchanges (written to .env by start.sh; not used by the backend yet)
    ACTIVE_EXCHANGES: Annotated[list[str], NoDecode] = ["IDX"]

    # Data sync settings
    DEFAULT_START_DATE: str = "2021-01-01"
    # Parallel ticker downloads per sync job (threads in the sync worker process).
    SYNC_WORKERS: int = 4
    # Re-fetch this many calendar days before the last stored bar, so late revisions by the
    # data source are picked up by the upsert.
    SYNC_REFETCH_DAYS: int = 7
    # Today's daily bar is only stored after this local time in Asia/Jakarta (WIB, UTC+7).
    # The IDX closing auction and post-trading end before this; the margin covers feed delay.
    SYNC_BAR_FINAL_AFTER: str = "17:00"
    # A job still `pending` this long after creation, with no worker holding its lock,
    # is treated as abandoned.
    SYNC_PENDING_GRACE_SECONDS: int = 300

    # Moving average windows (as specified)
    MA_WINDOWS: Annotated[list[int], NoDecode] = [5, 10, 15, 20, 50, 100, 200]

    # RSI period
    RSI_PERIOD: int = 14

    # MACD settings (standard)
    MACD_FAST: int = 12
    MACD_SLOW: int = 26
    MACD_SIGNAL: int = 9

    @field_validator("CORS_ORIGINS", "ACTIVE_EXCHANGES", "MA_WINDOWS", mode="before")
    @classmethod
    def _split_lists(cls, value: Any) -> Any:
        return _parse_list(value)

    @field_validator("DATABASE_URL")
    @classmethod
    def _explicit_driver(cls, value: str) -> str:
        return _normalize_database_url(value)


settings = Settings()
