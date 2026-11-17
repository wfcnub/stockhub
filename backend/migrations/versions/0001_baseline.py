"""baseline: v1.1.0 schema for PostgreSQL 18 (fresh start)

Revision ID: 0001
Revises:
Create Date: 2026-11-15

Replaces init_db.py (create_all + ad-hoc ALTERs). Fresh databases only: there is no
stamping path for pre-Alembic databases (decision: start fresh, re-sync data).

Differences from the pre-Alembic create_all schema:
- deterministic constraint names (naming convention in app.db.database)
- technical_indicators natural key UNIQUE NULLS NOT DISTINCT
  (ticker_id, indicator_type, window_period, date), replacing ix_ticker_indicator_date
- BIGINT ids on prices and technical_indicators (ON CONFLICT upserts burn sequence values)
- ON DELETE CASCADE from tickers/sync_jobs to indexes and from ticker children to tickers
- NOT NULL + server defaults on flags, counters, statuses and created_at
- CHECK constraints on sync_status.status and sync_jobs.status
- index on sync_jobs.status; redundant single-column/PK duplicate indexes dropped
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _ts_now() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "indexes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "yfinance_suffix", sa.String(length=10), server_default=sa.text("''"), nullable=False
        ),
        sa.Column("ticker_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        _ts_now(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_indexes")),
        sa.UniqueConstraint("code", name=op.f("uq_indexes_code")),
    )

    op.create_table(
        "tickers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("index_id", sa.Integer(), nullable=False),
        sa.Column("sector", sa.String(length=100), nullable=True),
        sa.Column("industry", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        _ts_now(),
        sa.ForeignKeyConstraint(
            ["index_id"],
            ["indexes.id"],
            name=op.f("fk_tickers_index_id_indexes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tickers")),
        sa.UniqueConstraint("symbol", name=op.f("uq_tickers_symbol")),
    )
    op.create_index(op.f("ix_tickers_index_id"), "tickers", ["index_id"])

    op.create_table(
        "sync_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sync_id", sa.String(length=100), nullable=False),
        sa.Column("index_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("total_tickers", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("processed_tickers", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("current_ticker", sa.String(length=20), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled')",
            name=op.f("ck_sync_jobs_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["index_id"],
            ["indexes.id"],
            name=op.f("fk_sync_jobs_index_id_indexes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sync_jobs")),
        sa.UniqueConstraint("sync_id", name=op.f("uq_sync_jobs_sync_id")),
    )
    op.create_index(op.f("ix_sync_jobs_index_id"), "sync_jobs", ["index_id"])
    op.create_index(op.f("ix_sync_jobs_status"), "sync_jobs", ["status"])

    op.create_table(
        "prices",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ticker_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open", sa.Double(), nullable=True),
        sa.Column("high", sa.Double(), nullable=True),
        sa.Column("low", sa.Double(), nullable=True),
        sa.Column("close", sa.Double(), nullable=False),
        sa.Column("volume", sa.BigInteger(), nullable=True),
        sa.Column("adj_close", sa.Double(), nullable=True),
        _ts_now(),
        sa.ForeignKeyConstraint(
            ["ticker_id"],
            ["tickers.id"],
            name=op.f("fk_prices_ticker_id_tickers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_prices")),
        sa.UniqueConstraint("ticker_id", "date", name=op.f("uq_prices_ticker_id_date")),
    )
    op.create_index(op.f("ix_prices_date"), "prices", ["date"])

    op.create_table(
        "key_metrics",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ticker_id", sa.Integer(), nullable=False),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column("market_cap", sa.BigInteger(), nullable=True),
        sa.Column("pe_ratio", sa.Double(), nullable=True),
        sa.Column("pbv", sa.Double(), nullable=True),
        sa.Column("dividend_yield", sa.Double(), nullable=True),
        sa.Column("eps", sa.Double(), nullable=True),
        sa.Column("roe", sa.Double(), nullable=True),
        sa.Column("fiscal_year", sa.Integer(), nullable=True),
        sa.Column("fiscal_quarter", sa.Integer(), nullable=True),
        sa.Column(
            "last_updated",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["ticker_id"],
            ["tickers.id"],
            name=op.f("fk_key_metrics_ticker_id_tickers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_key_metrics")),
        sa.UniqueConstraint(
            "ticker_id",
            "observation_date",
            name=op.f("uq_key_metrics_ticker_id_observation_date"),
        ),
    )

    op.create_table(
        "sync_status",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ticker_id", sa.Integer(), nullable=False),
        sa.Column("last_sync_date", sa.Date(), nullable=True),
        sa.Column("last_sync_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status", sa.String(length=20), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        _ts_now(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'syncing', 'completed', 'error')",
            name=op.f("ck_sync_status_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["ticker_id"],
            ["tickers.id"],
            name=op.f("fk_sync_status_ticker_id_tickers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sync_status")),
        sa.UniqueConstraint("ticker_id", name=op.f("uq_sync_status_ticker_id")),
    )

    op.create_table(
        "technical_indicators",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ticker_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("indicator_type", sa.String(length=30), nullable=False),
        sa.Column("window_period", sa.Integer(), nullable=True),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("extra_data", sa.String(length=500), nullable=True),
        _ts_now(),
        sa.ForeignKeyConstraint(
            ["ticker_id"],
            ["tickers.id"],
            name=op.f("fk_technical_indicators_ticker_id_tickers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technical_indicators")),
        sa.UniqueConstraint(
            "ticker_id",
            "indicator_type",
            "window_period",
            "date",
            name="uq_technical_indicators_natural_key",
            postgresql_nulls_not_distinct=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("technical_indicators")
    op.drop_table("sync_status")
    op.drop_table("key_metrics")
    op.drop_index(op.f("ix_prices_date"), table_name="prices")
    op.drop_table("prices")
    op.drop_index(op.f("ix_sync_jobs_status"), table_name="sync_jobs")
    op.drop_index(op.f("ix_sync_jobs_index_id"), table_name="sync_jobs")
    op.drop_table("sync_jobs")
    op.drop_index(op.f("ix_tickers_index_id"), table_name="tickers")
    op.drop_table("tickers")
    op.drop_table("indexes")
