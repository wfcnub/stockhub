# StockHub Database Design (v0.2.2)

> **Source of Truth** - This document defines the database schema. PostgreSQL is the recommended engine to leverage time-series performance and JSONB support for error logging.

---

## Overview

StockHub uses a relational schema optimized for financial data. The core shift in v1.1.0 is treating **Key Metrics** as a time-series table to track valuation changes (P/E, Market Cap) over time, rather than just keeping a current snapshot. v0.2.0 expands the schema with full OHLCV data, technical indicators, additional metrics, and enhanced tracking fields.

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
| name | VARCHAR(255) | NOT NULL | Company name |
| index_id | INTEGER | REFERENCES indexes(id) | Foreign key |
| sector | VARCHAR(100) | | Business category |
| industry | VARCHAR(100) | | Industry classification |
| is_active | BOOLEAN | DEFAULT true | Soft delete flag |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

---

### 3. prices (Time-Series)
Historical OHLCV data with full price details.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | REFERENCES tickers(id) ON DELETE CASCADE | Foreign key |
| date | DATE | NOT NULL | Trading day |
| open | DECIMAL(18,4) | NOT NULL | Opening price |
| high | DECIMAL(18,4) | NOT NULL | Daily high |
| low | DECIMAL(18,4) | NOT NULL | Daily low |
| close | DECIMAL(18,4) | NOT NULL | Closing price |
| volume | BIGINT | NOT NULL | Units traded |
| adj_close | DECIMAL(18,4) | | Adjusted closing price |

**Constraint:** `UNIQUE (ticker_id, date)` — ensures one price record per ticker per day.

---

### 4. key_metrics (Time-Series)
Historical fundamental data for valuation tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | REFERENCES tickers(id) ON DELETE CASCADE | Foreign key |
| observation_date | DATE | NOT NULL | Date metric was recorded |
| market_cap | BIGINT | | Valuation on that date |
| pe_ratio | DECIMAL(10,4) | | Price-to-earnings ratio |
| pbv | DECIMAL(10,4) | | Price-to-book value |
| dividend_yield | DECIMAL(6,4) | | Dividend yield percentage |
| eps | DECIMAL(18,4) | | Earnings per share |
| roe | DECIMAL(8,4) | | Return on equity |
| fiscal_year | INTEGER | | e.g., 2026 |
| fiscal_quarter | INTEGER | | Q1, Q2, Q3, Q4 |
| last_updated | TIMESTAMP | DEFAULT NOW() | Record update time |

---

### 5. technical_indicators (Time-Series)
Stores technical indicator values used by chart overlays and momentum panels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated ID |
| ticker_id | INTEGER | REFERENCES tickers(id) | Foreign key |
| date | DATE | NOT NULL | Trading day |
| indicator_type | VARCHAR(30) | NOT NULL | e.g., sma, ema, rsi, macd |
| window_period | INTEGER | NULL | For windowed indicators (e.g., SMA 20, RSI 14) |
| value | FLOAT | NOT NULL | Main indicator value |
| extra_data | VARCHAR(500) | NULL | JSON string for extra values (e.g., MACD signal/histogram) |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Composite Index:** `ix_ticker_indicator_date (ticker_id, indicator_type, date)` for fast chart queries.

---

### 6. sync_jobs
Tracks batch operations for the landing page progress UI.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-generated ID |
| sync_id | VARCHAR(100) | UNIQUE, NOT NULL | Unique job identifier |
| index_id | INTEGER | REFERENCES indexes(id) | Foreign key to index |
| status | VARCHAR(20) | NOT NULL | pending, in_progress, completed, failed |
| total_tickers | INTEGER | DEFAULT 0 | Total tickers in batch |
| processed_tickers | INTEGER | DEFAULT 0 | Count for progress bar |
| current_ticker | VARCHAR(20) | | Currently processing ticker |
| started_at | TIMESTAMP | DEFAULT NOW() | Job start time |
| completed_at | TIMESTAMP | | Job completion time |

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
    name VARCHAR(255) NOT NULL,
    index_id INTEGER REFERENCES indexes(id),
    sector VARCHAR(100),
    industry VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Prices (Core Time-Series data for charts)
CREATE TABLE prices (
    id BIGSERIAL PRIMARY KEY,
    ticker_id INTEGER REFERENCES tickers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    open DECIMAL(18,4) NOT NULL,
    high DECIMAL(18,4) NOT NULL,
    low DECIMAL(18,4) NOT NULL,
    close DECIMAL(18,4) NOT NULL,
    volume BIGINT NOT NULL,
    adj_close DECIMAL(18,4),
    UNIQUE (ticker_id, date)
);

-- 4. Key Metrics (Revised to Time-Series for historical valuation)
CREATE TABLE key_metrics (
    id BIGSERIAL PRIMARY KEY,
    ticker_id INTEGER REFERENCES tickers(id) ON DELETE CASCADE,
    observation_date DATE NOT NULL,
    market_cap BIGINT,
    pe_ratio DECIMAL(10,4),
    pbv DECIMAL(10,4),
    dividend_yield DECIMAL(6,4),
    eps DECIMAL(18,4),
    roe DECIMAL(8,4),
    fiscal_year INTEGER,
    fiscal_quarter INTEGER,
    last_updated TIMESTAMP DEFAULT NOW()
);

-- 5. Technical Indicators (Time-Series for chart overlays)
CREATE TABLE technical_indicators (
    id BIGSERIAL PRIMARY KEY,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id),
    date DATE NOT NULL,
    indicator_type VARCHAR(30) NOT NULL,
    window_period INTEGER,
    value FLOAT NOT NULL,
    extra_data VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Sync Jobs (For Landing Page progress tracking)
CREATE TABLE sync_jobs (
    id SERIAL PRIMARY KEY,
    sync_id VARCHAR(100) UNIQUE NOT NULL,
    index_id INTEGER REFERENCES indexes(id),
    status VARCHAR(20) NOT NULL,
    total_tickers INTEGER DEFAULT 0,
    processed_tickers INTEGER DEFAULT 0,
    current_ticker VARCHAR(20),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
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
| 0.2.2 | 2026-04-07 | Added `technical_indicators` table to schema docs (columns, relationships, SQL DDL, and performance indexes) |
| 0.2.1 | 2026-04-06 | Added `yfinance_suffix` column to indexes table for exchange-specific suffix support |
| 0.2.0 | 2026-04-02 | Added full OHLCV to prices; added industry/is_active/created_at to tickers; added ticker_count/is_active/created_at to indexes; added pbv/dividend_yield/roe/fiscal_quarter/last_updated to key_metrics; added id/index_id/current_ticker/timestamps to sync_jobs; added idx_sync_jobs_status |
| 0.1.1 | 2026-04-02 | Converted key_metrics to time-series; simplified schema |
| 0.1.0 | 2026-04-01 | Initial database design |