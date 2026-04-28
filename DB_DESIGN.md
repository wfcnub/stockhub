# StockHub Database Design (v1.1.0)

> **Source of Truth** - This document defines the database schema. PostgreSQL is the recommended engine to leverage time-series performance and JSONB support for error logging.

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

### 1. indexes
Stores market index metadata and global sync timestamps.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| code | VARCHAR(20) | UNIQUE, NOT NULL | e.g., "JCI" |
| name | VARCHAR(255) | NOT NULL | Full index name |
| yfinance_suffix | VARCHAR(10) | DEFAULT '' | Yahoo Finance suffix (e.g., ".JK" for IDX) |
| ticker_count | INTEGER | DEFAULT 0 | Number of tickers in index |
| is_active | BOOLEAN | DEFAULT true | Soft delete flag |
| last_synced_at | TIMESTAMP | NULL | Used for Hero section stats |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

---

### 2. tickers
Basic information for each listed company.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| symbol | VARCHAR(20) | UNIQUE, NOT NULL | e.g., "BBCA" |
| name | VARCHAR(255) | NULL | Company name |
| index_id | INTEGER | REFERENCES indexes(id), NOT NULL | Foreign key |
| sector | VARCHAR(100) | | Business category |
| industry | VARCHAR(100) | | Industry classification |
| is_active | BOOLEAN | DEFAULT true | Soft delete flag |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

---

### 3. prices (Time-Series)
Historical OHLCV data with full price details.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | REFERENCES tickers(id), NOT NULL | Foreign key |
| date | DATE | NOT NULL | Trading day |
| open | FLOAT | NULL | Opening price |
| high | FLOAT | NULL | Daily high |
| low | FLOAT | NULL | Daily low |
| close | FLOAT | NOT NULL | Closing price |
| volume | BIGINT | NULL | Units traded |
| adj_close | FLOAT | NULL | Adjusted closing price |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Constraint:** `UNIQUE (ticker_id, date)` — ensures one price record per ticker per day.

---

### 4. key_metrics (Time-Series)
Historical fundamental data for valuation tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | REFERENCES tickers(id), NOT NULL | Foreign key |
| observation_date | DATE | NOT NULL | Date metric was recorded |
| market_cap | BIGINT | | Valuation on that date |
| pe_ratio | FLOAT | | Price-to-earnings ratio |
| pbv | FLOAT | | Price-to-book value |
| dividend_yield | FLOAT | | Dividend yield percentage |
| eps | FLOAT | | Earnings per share |
| roe | FLOAT | | Return on equity |
| fiscal_year | INTEGER | | e.g., 2026 |
| fiscal_quarter | INTEGER | | Q1, Q2, Q3, Q4 |
| last_updated | TIMESTAMP | DEFAULT NOW() | Record update time |

**Constraint:** `UNIQUE (ticker_id, observation_date)` — ensures one metrics snapshot per ticker per observation date.

---

### 5. technical_indicators (Time-Series)
Stores technical indicator values used by chart overlays and momentum panels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | REFERENCES tickers(id), NOT NULL | Foreign key |
| date | DATE | NOT NULL | Trading day |
| indicator_type | VARCHAR(30) | NOT NULL | e.g., sma, ema, rsi, macd_sma, macd_ema (legacy rows may use macd) |
| window_period | INTEGER | NULL | For windowed indicators (e.g., SMA 20, RSI 14) |
| value | FLOAT | NOT NULL | Main indicator value |
| extra_data | VARCHAR(500) | NULL | JSON string for extra values (e.g., MACD signal/histogram/ma_type) |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Composite Index:** `ix_ticker_indicator_date (ticker_id, indicator_type, date)` for fast chart queries.

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
| ticker_id | INTEGER | UNIQUE, REFERENCES tickers(id), NOT NULL | One row per ticker |
| last_sync_date | DATE | NULL | Last date of price data synced |
| last_sync_timestamp | TIMESTAMP | NULL | Last sync attempt timestamp |
| status | VARCHAR(20) | DEFAULT 'pending' | `pending`, `syncing`, `completed`, `error` |
| error_message | VARCHAR(500) | NULL | Last sync error message |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | NULL | Last update timestamp |

---

### 7. sync_jobs
Tracks batch operations for the landing page progress UI.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| sync_id | VARCHAR(100) | UNIQUE, NOT NULL | Unique job identifier |
| index_id | INTEGER | REFERENCES indexes(id), NOT NULL | Foreign key to index |
| status | VARCHAR(20) | NOT NULL | pending, in_progress, running (legacy), completed, failed, cancelled |
| total_tickers | INTEGER | DEFAULT 0 | Total tickers in batch |
| processed_tickers | INTEGER | DEFAULT 0 | Count for progress bar |
| current_ticker | VARCHAR(20) | | Currently processing ticker |
| started_at | TIMESTAMP | DEFAULT NOW() | Job start time |
| completed_at | TIMESTAMP | | Job completion time |
| error_message | VARCHAR(500) | NULL | Error details if job fails/stops |

**Status compatibility note:** runtime rows may still contain legacy `running`; API responses normalize that value to `in_progress`.

---

## Performance Strategy

* **Partitioning**: For `prices`, `key_metrics`, and `technical_indicators`, consider partitioning by date as the dataset grows.
* **Indexing**: 
    * `idx_prices_ticker_date`: (ticker_id, date DESC) — optimize price lookups
    * `idx_metrics_ticker_date`: (ticker_id, observation_date DESC) — optimize metrics lookups
    * `ix_ticker_indicator_date`: (ticker_id, indicator_type, date) — optimize indicator lookups for chart API
    * `idx_sync_jobs_status`: (status) — optimize job queue queries

---

## SQL Schema

```sql
-- 1. Indexes (Stores global sync metadata)
CREATE TABLE indexes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    yfinance_suffix VARCHAR(10) DEFAULT '',
    ticker_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tickers (Company metadata)
CREATE TABLE tickers (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255),
    index_id INTEGER NOT NULL REFERENCES indexes(id),
    sector VARCHAR(100),
    industry VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Prices (Core Time-Series data for charts)
CREATE TABLE prices (
    id SERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id),
    date DATE NOT NULL,
    open FLOAT,
    high FLOAT,
    low FLOAT,
    close FLOAT NOT NULL,
    volume BIGINT,
    adj_close FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (ticker_id, date)
);

-- 4. Key Metrics (Revised to Time-Series for historical valuation)
CREATE TABLE key_metrics (
    id BIGSERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id),
    observation_date DATE NOT NULL,
    market_cap BIGINT,
    pe_ratio FLOAT,
    pbv FLOAT,
    dividend_yield FLOAT,
    eps FLOAT,
    roe FLOAT,
    fiscal_year INTEGER,
    fiscal_quarter INTEGER,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE (ticker_id, observation_date)
);

-- 5. Technical Indicators (Time-Series for chart overlays)
CREATE TABLE technical_indicators (
    id SERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id),
    date DATE NOT NULL,
    indicator_type VARCHAR(30) NOT NULL,
    window_period INTEGER,
    value FLOAT NOT NULL,
    extra_data VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Sync status (per ticker sync health)
CREATE TABLE sync_status (
    id SERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL UNIQUE REFERENCES tickers(id),
    last_sync_date DATE,
    last_sync_timestamp TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    error_message VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 7. Sync Jobs (For Landing Page progress tracking)
CREATE TABLE sync_jobs (
    id SERIAL PRIMARY KEY,
    sync_id VARCHAR(100) UNIQUE NOT NULL,
    index_id INTEGER NOT NULL REFERENCES indexes(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_tickers INTEGER DEFAULT 0,
    processed_tickers INTEGER DEFAULT 0,
    current_ticker VARCHAR(20),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message VARCHAR(500)
);

-- Crucial Indexes for Performance
CREATE INDEX idx_prices_ticker_date ON prices(ticker_id, date DESC);
CREATE INDEX idx_metrics_ticker_date ON key_metrics(ticker_id, observation_date DESC);
CREATE INDEX ix_ticker_indicator_date ON technical_indicators(ticker_id, indicator_type, date);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-04-28 | Triangle pattern feature complete: on-demand detection for symmetrical, ascending, and descending triangles with potential and breakout states via `/charts/{ticker_symbol}/triangles` and `/screener/triangles` APIs. No schema changes; detection runs on-demand from existing `prices` data. |
| 1.0.1 | 2026-04-14 | Documented MACD mode-aware storage conventions in `technical_indicators` using `indicator_type` values `macd_sma` and `macd_ema`, plus legacy `macd` compatibility during migration/backfill. |
| 1.0.0 | 2026-04-10 | First stable schema release docs. Confirmed ORM alignment for all active tables/constraints, clarified sync job status compatibility (`running` legacy mapped to `in_progress` at API layer), and corrected `technical_indicators.ticker_id` as NOT NULL in table docs. |
| 0.2.3 | 2026-04-10 | Aligned schema docs to active models: added `sync_status` table, updated `prices`/`technical_indicators` IDs to integer auto-increment, adjusted nullable fields and float types, documented `key_metrics` unique constraint (`ticker_id`, `observation_date`), and expanded `sync_jobs` statuses plus `error_message`. |
| 0.2.2 | 2026-04-07 | Added `technical_indicators` table to schema docs (columns, relationships, SQL DDL, and performance indexes) |
| 0.2.1 | 2026-04-06 | Added `yfinance_suffix` column to indexes table for exchange-specific suffix support |
| 0.2.0 | 2026-04-02 | Added full OHLCV to prices; added industry/is_active/created_at to tickers; added ticker_count/is_active/created_at to indexes; added pbv/dividend_yield/roe/fiscal_quarter/last_updated to key_metrics; added id/index_id/current_ticker/timestamps to sync_jobs; added idx_sync_jobs_status |
| 0.1.1 | 2026-04-02 | Converted key_metrics to time-series; simplified schema |
| 0.1.0 | 2026-04-01 | Initial database design |