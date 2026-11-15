# StockHub Database Design (v1.3.0)

> **Source of Truth** - This document defines the database schema. The engine is **PostgreSQL 18 only** (SQLite is no longer supported). The schema is created and changed **only through Alembic migrations** in `backend/migrations/` (`uv run alembic upgrade head`); the SQLAlchemy models in `backend/app/models/` must match the latest revision, which `alembic check` verifies in the tests.

---

## Overview

StockHub uses a relational schema optimized for financial time-series workloads. **Key Metrics** are modeled as a time-series table to track valuation changes over time (not just the latest snapshot). The v1.1.0 documentation pass confirms alignment with active ORM models, including per-ticker sync health in `sync_status`, full OHLCV history in `prices`, indicator overlays in `technical_indicators`, batch workflow progress in `sync_jobs`, and on-demand triangle pattern detection from existing `prices` data.

---

## Entity Relationship Diagram

```
┌─────────────────┐
│     indexes     │
├─────────────────┤
│ id (PK)         │
│ code            │
│ name            │
│ ticker_count    │
│ is_active       │
│ last_synced_at  │
│ created_at      │
└────────┬────────┘
         │
         │ 1
         │
    ┌────┴──────────────────────────┐
    │                               │
    │ *                             │ *
    ▼                               ▼
┌─────────────────┐         ┌───────────────────┐
│    tickers      │         │    sync_jobs      │
├─────────────────┤         ├───────────────────┤
│ id (PK)         │         │ id (PK)           │
│ symbol          │         │ sync_id           │
│ name            │         │ index_id (FK)     │
│ index_id (FK)   │◄────────│ status            │
│ sector          │         │ total_tickers     │
│ industry        │         │ processed_tickers │
│ is_active       │         │ current_ticker    │
│ created_at      │         │ started_at        │
└────────┬────────┘         │ completed_at      │
         │                  └───────────────────┘
         │ 1
         │
    ┌────┴─────────────────────┐
    │                          │
    │ *                        │ *
    ▼                          ▼
┌─────────────────┐  ┌─────────────────────┐
│    prices       │  │    key_metrics      │
├─────────────────┤  ├─────────────────────┤
│ id (PK)         │  │ id (PK)             │
│ ticker_id (FK)  │  │ ticker_id (FK)      │
│ date            │  │ observation_date    │
│ open            │  │ market_cap          │
│ high            │  │ pe_ratio            │
│ low             │  │ pbv                 │
│ close           │  │ dividend_yield      │
│ volume          │  │ eps                 │
│ adj_close       │  │ roe                 │
└─────────────────┘  │ fiscal_year         │
                     │ fiscal_quarter      │
                     │ last_updated        │
                     └─────────────────────┘

                     ┌──────────────────────────┐
                     │ technical_indicators     │
                     ├──────────────────────────┤
                     │ id (PK)                  │
                     │ ticker_id (FK)           │
                     │ date                      │
                     │ indicator_type            │
                     │ window_period             │
                     │ value                     │
                     │ extra_data                │
                     │ created_at                │
                     └──────────────────────────┘

FK = Foreign Key    PK = Primary Key
```

**Relationships:**
- `indexes` 1──* `tickers` (one index has many tickers)
- `indexes` 1──* `sync_jobs` (one index has many sync jobs)
- `tickers` 1──* `prices` (one ticker has many price records)
- `tickers` 1──* `key_metrics` (one ticker has many metric records)
- `tickers` 1──* `technical_indicators` (one ticker has many indicator records)
- `tickers` 1──1 `sync_status` (one ticker has one sync status row)

---

## Tables

Conventions (from the models' naming convention): `pk_<table>`, `uq_<table>_<cols>`, `fk_<table>_<col>_<ref>`, `ck_<table>_<name>`, `ix_<table>_<cols>`. Every timestamp is `TIMESTAMPTZ`. Float columns are `DOUBLE PRECISION`. All child rows are removed by `ON DELETE CASCADE` when their ticker or index is hard-deleted.

### 1. indexes
Stores market index metadata and global sync timestamps.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| code | VARCHAR(20) | UNIQUE, NOT NULL | e.g., "JCI" |
| name | VARCHAR(255) | NOT NULL | Full index name |
| yfinance_suffix | VARCHAR(10) | NOT NULL, DEFAULT '' | Yahoo Finance suffix (e.g., ".JK" for IDX) |
| ticker_count | INTEGER | NOT NULL, DEFAULT 0 | Number of tickers in index |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Soft delete flag |
| last_synced_at | TIMESTAMPTZ | NULL | Used for Hero section stats |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

---

### 2. tickers
Basic information for each listed company.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| symbol | VARCHAR(20) | UNIQUE, NOT NULL | e.g., "BBCA" |
| name | VARCHAR(255) | NULL | Company name |
| index_id | INTEGER | NOT NULL, REFERENCES indexes(id) ON DELETE CASCADE | Indexed (`ix_tickers_index_id`) |
| sector | VARCHAR(100) | NULL | Business category |
| industry | VARCHAR(100) | NULL | Industry classification |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Soft delete flag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

---

### 3. prices (Time-Series)
Historical OHLCV data with full price details.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | 64-bit, because `ON CONFLICT` upserts consume sequence values |
| ticker_id | INTEGER | NOT NULL, REFERENCES tickers(id) ON DELETE CASCADE | Foreign key |
| date | DATE | NOT NULL | Trading day (indexed, `ix_prices_date`) |
| open | DOUBLE PRECISION | NULL | Opening price |
| high | DOUBLE PRECISION | NULL | Daily high |
| low | DOUBLE PRECISION | NULL | Daily low |
| close | DOUBLE PRECISION | NOT NULL | Closing price |
| volume | BIGINT | NULL | Units traded |
| adj_close | DOUBLE PRECISION | NULL | Adjusted closing price |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

**Natural key:** `uq_prices_ticker_id_date UNIQUE (ticker_id, date)`: one price record per ticker per day. It also serves `(ticker_id, date)` range lookups.

---

### 4. key_metrics (Time-Series)
Historical fundamental data for valuation tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | NOT NULL, REFERENCES tickers(id) ON DELETE CASCADE | Foreign key |
| observation_date | DATE | NOT NULL | Date metric was recorded |
| market_cap | BIGINT | NULL | Valuation on that date |
| pe_ratio | DOUBLE PRECISION | NULL | Price-to-earnings ratio |
| pbv | DOUBLE PRECISION | NULL | Price-to-book value |
| dividend_yield | DOUBLE PRECISION | NULL | Dividend yield percentage |
| eps | DOUBLE PRECISION | NULL | Earnings per share |
| roe | DOUBLE PRECISION | NULL | Return on equity |
| fiscal_year | INTEGER | NULL | e.g., 2026 |
| fiscal_quarter | INTEGER | NULL | 1-4 |
| last_updated | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record update time |

**Natural key:** `uq_key_metrics_ticker_id_observation_date UNIQUE (ticker_id, observation_date)`.

---

### 5. technical_indicators (Time-Series)
Stores technical indicator values used by chart overlays and momentum panels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | 64-bit, because `ON CONFLICT` upserts consume sequence values |
| ticker_id | INTEGER | NOT NULL, REFERENCES tickers(id) ON DELETE CASCADE | Foreign key |
| date | DATE | NOT NULL | Trading day |
| indicator_type | VARCHAR(30) | NOT NULL | e.g., sma, ema, rsi, macd_sma, macd_ema (legacy rows may use macd) |
| window_period | INTEGER | NULL | For windowed indicators (e.g., SMA 20, RSI 14); NULL for MACD |
| value | DOUBLE PRECISION | NOT NULL | Main indicator value |
| extra_data | VARCHAR(500) | NULL | JSON string for extra values (e.g., MACD signal/histogram/ma_type) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

**Natural key:** `uq_technical_indicators_natural_key UNIQUE NULLS NOT DISTINCT (ticker_id, indicator_type, window_period, date)`. One value per indicator, window and day; `NULLS NOT DISTINCT` makes rows with a NULL `window_period` (MACD) unique too. It replaces the old `ix_ticker_indicator_date` index and lets the sync use `INSERT ... ON CONFLICT` instead of per-row lookups.

**MACD storage conventions:**
- `macd_sma`: MACD values computed with SMA-based lines/signals.
- `macd_ema`: MACD values computed with EMA-based lines/signals.
- Legacy `macd` rows are treated as EMA until migrated.

---

### 6. sync_status
Tracks last per-ticker synchronization health/state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | UNIQUE, NOT NULL, REFERENCES tickers(id) ON DELETE CASCADE | One row per ticker |
| last_sync_date | DATE | NULL | Last date of price data synced |
| last_sync_timestamp | TIMESTAMPTZ | NULL | Last sync attempt timestamp |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK | `pending`, `syncing`, `completed`, `error` (`ck_sync_status_status_valid`) |
| error_message | VARCHAR(500) | NULL | Last sync error message |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |
| updated_at | TIMESTAMPTZ | NULL | Last update timestamp |

---

### 7. sync_jobs
Tracks batch operations for the landing page progress UI.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| sync_id | VARCHAR(100) | UNIQUE, NOT NULL | Unique job identifier |
| index_id | INTEGER | NOT NULL, REFERENCES indexes(id) ON DELETE CASCADE | Indexed (`ix_sync_jobs_index_id`) |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK | pending, in_progress, running (legacy), completed, failed, cancelled (`ck_sync_jobs_status_valid`; indexed, `ix_sync_jobs_status`) |
| total_tickers | INTEGER | NOT NULL, DEFAULT 0 | Total tickers in batch |
| processed_tickers | INTEGER | NOT NULL, DEFAULT 0 | Count for progress bar |
| failed_tickers | INTEGER | NOT NULL, DEFAULT 0 | Tickers that failed in this job (rev 0002); per-ticker details in `sync_status.error_message` |
| current_ticker | VARCHAR(20) | NULL | Currently processing ticker |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Job start time |
| completed_at | TIMESTAMPTZ | NULL | Job completion time |
| error_message | VARCHAR(500) | NULL | Error details if job fails/stops |

**Status compatibility note:** runtime rows may still contain legacy `running`; API responses normalize that value to `in_progress`.

---

## Migrations

- Tool: Alembic, configured in `backend/alembic.ini` and `backend/migrations/env.py`. The URL comes from `DATABASE_URL`, which must be PostgreSQL.
- `0001_baseline` creates the schema below on an empty database. There is no upgrade path from pre-1.2.0 databases: StockHub starts fresh, and data is re-synced.
- Apply: `cd backend && uv run alembic upgrade head`. Deployments run this before the API starts.
- Change the schema: edit the models, `uv run alembic revision --autogenerate -m "..."`, review the generated file, and update this document. Revisions must be reversible (`downgrade`), and backward-compatible with the previous release, because a deploy rollback restores images, not the schema.
- Tests (`backend/tests/test_migrations.py`, PostgreSQL via `TEST_DATABASE_URL`) run upgrade → downgrade → upgrade, check that `alembic check` finds no difference between the models and the migrations, and check the constraints.

---

## Performance Strategy

* **Partitioning**: For `prices`, `key_metrics`, and `technical_indicators`, consider partitioning by date as the dataset grows.
* **Indexing**:
    * `uq_prices_ticker_id_date`, `uq_key_metrics_ticker_id_observation_date`, `uq_technical_indicators_natural_key`: the natural keys also serve per-ticker range lookups (they replace the former `idx_prices_ticker_date`, `idx_metrics_ticker_date` and `ix_ticker_indicator_date`).
    * `ix_prices_date`: cross-ticker queries by date (screeners, latest bar).
    * `ix_sync_jobs_status`, `ix_sync_jobs_index_id`, `ix_tickers_index_id`: job queue and foreign-key lookups and cascades.

---

## SQL Schema

Generated from Alembic revisions `0001_baseline` and `0002_sync_jobs_failed_tickers` (`uv run alembic upgrade head --sql`, without the `alembic_version` table).

```sql
CREATE TABLE indexes (
    id SERIAL NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    yfinance_suffix VARCHAR(10) DEFAULT '' NOT NULL,
    ticker_count INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_indexes PRIMARY KEY (id),
    CONSTRAINT uq_indexes_code UNIQUE (code)
);

CREATE TABLE tickers (
    id SERIAL NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    index_id INTEGER NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_tickers PRIMARY KEY (id),
    CONSTRAINT fk_tickers_index_id_indexes FOREIGN KEY(index_id) REFERENCES indexes (id) ON DELETE CASCADE,
    CONSTRAINT uq_tickers_symbol UNIQUE (symbol)
);

CREATE INDEX ix_tickers_index_id ON tickers (index_id);

CREATE TABLE sync_jobs (
    id SERIAL NOT NULL,
    sync_id VARCHAR(100) NOT NULL,
    index_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    total_tickers INTEGER DEFAULT 0 NOT NULL,
    processed_tickers INTEGER DEFAULT 0 NOT NULL,
    failed_tickers INTEGER DEFAULT 0 NOT NULL,  -- added in 0002
    current_ticker VARCHAR(20),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message VARCHAR(500),
    CONSTRAINT pk_sync_jobs PRIMARY KEY (id),
    CONSTRAINT ck_sync_jobs_status_valid CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT fk_sync_jobs_index_id_indexes FOREIGN KEY(index_id) REFERENCES indexes (id) ON DELETE CASCADE,
    CONSTRAINT uq_sync_jobs_sync_id UNIQUE (sync_id)
);

CREATE INDEX ix_sync_jobs_index_id ON sync_jobs (index_id);

CREATE INDEX ix_sync_jobs_status ON sync_jobs (status);

CREATE TABLE prices (
    id BIGSERIAL NOT NULL,
    ticker_id INTEGER NOT NULL,
    date DATE NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION NOT NULL,
    volume BIGINT,
    adj_close DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_prices PRIMARY KEY (id),
    CONSTRAINT fk_prices_ticker_id_tickers FOREIGN KEY(ticker_id) REFERENCES tickers (id) ON DELETE CASCADE,
    CONSTRAINT uq_prices_ticker_id_date UNIQUE (ticker_id, date)
);

CREATE INDEX ix_prices_date ON prices (date);

CREATE TABLE key_metrics (
    id BIGSERIAL NOT NULL,
    ticker_id INTEGER NOT NULL,
    observation_date DATE NOT NULL,
    market_cap BIGINT,
    pe_ratio DOUBLE PRECISION,
    pbv DOUBLE PRECISION,
    dividend_yield DOUBLE PRECISION,
    eps DOUBLE PRECISION,
    roe DOUBLE PRECISION,
    fiscal_year INTEGER,
    fiscal_quarter INTEGER,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_key_metrics PRIMARY KEY (id),
    CONSTRAINT fk_key_metrics_ticker_id_tickers FOREIGN KEY(ticker_id) REFERENCES tickers (id) ON DELETE CASCADE,
    CONSTRAINT uq_key_metrics_ticker_id_observation_date UNIQUE (ticker_id, observation_date)
);

CREATE TABLE sync_status (
    id SERIAL NOT NULL,
    ticker_id INTEGER NOT NULL,
    last_sync_date DATE,
    last_sync_timestamp TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    error_message VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pk_sync_status PRIMARY KEY (id),
    CONSTRAINT ck_sync_status_status_valid CHECK (status IN ('pending', 'syncing', 'completed', 'error')),
    CONSTRAINT fk_sync_status_ticker_id_tickers FOREIGN KEY(ticker_id) REFERENCES tickers (id) ON DELETE CASCADE,
    CONSTRAINT uq_sync_status_ticker_id UNIQUE (ticker_id)
);

CREATE TABLE technical_indicators (
    id BIGSERIAL NOT NULL,
    ticker_id INTEGER NOT NULL,
    date DATE NOT NULL,
    indicator_type VARCHAR(30) NOT NULL,
    window_period INTEGER,
    value DOUBLE PRECISION NOT NULL,
    extra_data VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_technical_indicators PRIMARY KEY (id),
    CONSTRAINT fk_technical_indicators_ticker_id_tickers FOREIGN KEY(ticker_id) REFERENCES tickers (id) ON DELETE CASCADE,
    CONSTRAINT uq_technical_indicators_natural_key UNIQUE NULLS NOT DISTINCT (ticker_id, indicator_type, window_period, date)
);
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.3.0 | 2026-11-15 | Revision `0002`: `sync_jobs.failed_tickers INTEGER NOT NULL DEFAULT 0`. Sync upserts use `ON CONFLICT` on `uq_prices_ticker_id_date` and `uq_technical_indicators_natural_key` and skip unchanged rows. |
| 1.2.0 | 2026-11-15 | PostgreSQL 18 only, and the schema is managed by Alembic (`0001_baseline`), replacing `init_db.py` and SQLite support. Natural key `uq_technical_indicators_natural_key UNIQUE NULLS NOT DISTINCT (ticker_id, indicator_type, window_period, date)` replaces `ix_ticker_indicator_date`. `prices.id` and `technical_indicators.id` are BIGSERIAL. `ON DELETE CASCADE` on all ticker and index foreign keys (index hard delete now cascades as the API documents). NOT NULL with server defaults on flags, counters, statuses and creation timestamps. CHECK constraints on `sync_status.status` and `sync_jobs.status`. All timestamps are TIMESTAMPTZ. Constraint names follow the `pk_/uq_/fk_/ck_/ix_` convention. Redundant indexes are dropped and `ix_prices_date` is added. No upgrade path from older databases (fresh start). |
| 1.1.0 | 2026-04-28 | Triangle pattern feature complete: on-demand detection for symmetrical, ascending, and descending triangles with potential and breakout states via `/charts/{ticker_symbol}/triangles` and `/screener/triangles` APIs. No schema changes; detection runs on-demand from existing `prices` data. |
| 1.0.1 | 2026-04-14 | Documented MACD mode-aware storage conventions in `technical_indicators` using `indicator_type` values `macd_sma` and `macd_ema`, plus legacy `macd` compatibility during migration/backfill. |
| 1.0.0 | 2026-04-10 | First stable schema release docs. Confirmed ORM alignment for all active tables/constraints, clarified sync job status compatibility (`running` legacy mapped to `in_progress` at API layer), and corrected `technical_indicators.ticker_id` as NOT NULL in table docs. |
| 0.2.3 | 2026-04-10 | Aligned schema docs to active models: added `sync_status` table, updated `prices`/`technical_indicators` IDs to integer auto-increment, adjusted nullable fields and float types, documented `key_metrics` unique constraint (`ticker_id`, `observation_date`), and expanded `sync_jobs` statuses plus `error_message`. |
| 0.2.2 | 2026-04-07 | Added `technical_indicators` table to schema docs (columns, relationships, SQL DDL, and performance indexes) |
| 0.2.1 | 2026-04-06 | Added `yfinance_suffix` column to indexes table for exchange-specific suffix support |
| 0.2.0 | 2026-04-02 | Added full OHLCV to prices; added industry/is_active/created_at to tickers; added ticker_count/is_active/created_at to indexes; added pbv/dividend_yield/roe/fiscal_quarter/last_updated to key_metrics; added id/index_id/current_ticker/timestamps to sync_jobs; added idx_sync_jobs_status |
| 0.1.1 | 2026-04-02 | Converted key_metrics to time-series; simplified schema |
| 0.1.0 | 2026-04-01 | Initial database design |