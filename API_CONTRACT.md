# StockHub API Contract (v0.2.0)

> **Source of Truth** - This document defines the API contract. Backend must implement these endpoints. Frontend must consume these endpoints.

**Base URL**: `http://localhost:8000/api/v1`

---

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stats` | GET | Platform statistics for the Hero section |
| `/indexes` | GET | List available indexes for sync selection |
| `/tickers` | GET | List tickers with pagination and search |
| `/tickers/{symbol}` | GET | Ticker profile and the latest fundamental metrics |
| `/tickers/{symbol}/chart` | GET | Unified Price + Technical Indicator historical data |
| `/sync/start` | POST | Trigger a background sync job for an index |
| `/sync/progress` | GET | Poll the real-time progress of a sync job |
| `/screener` | GET | Predefined stock screeners (e.g., Bullish Divergence) |

---

## 1. Platform Statistics (Hero Section)

### GET /stats

Returns aggregate data for the Landing Page Hero section.

**Response:**
```json
{
  "total_tickers": 850,
  "total_indexes": 2,
  "last_global_sync": "2026-04-01T10:30:00Z",
  "indexes": [
    {
      "code": "IDX",
      "name": "Jakarta Composite Index",
      "ticker_count": 850,
      "last_sync": "2026-04-01T10:30:00Z"
    }
  ]
}
```

---

## 2. Index Selection

### GET /indexes

Lists available indexes specifically for the sync selection dropdown.

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "code": "IDX",
      "name": "Jakarta Composite Index",
      "is_active": true
    }
  ]
}
```

---

## 3. Sync Operations (Landing Page UI)

### POST /sync/start

Starts a background sync job for a specific index.

**Request Body:**
```json
{
  "index_code": "IDX"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| index_code | string | Yes | Index code to sync |

**Response:**
```json
{
  "sync_id": "sync_20260401_103000",
  "index_code": "IDX",
  "status": "in_progress",
  "message": "Sync started for IDX"
}
```

---

### GET /sync/progress

Polls the progress of the active sync job for the UI progress bar.

**Response:**
```json
{
  "sync_id": "sync_20260401_001",
  "status": "in_progress",
  "progress": {
    "total_tickers": 850,
    "processed_tickers": 425,
    "percent_complete": 50.0,
    "current_ticker": "BBCA",
    "estimated_remaining_seconds": 120
  }
}
```

**Status values:** `pending`, `in_progress`, `completed`, `failed`

---

## 4. Ticker Discovery

### GET /tickers

List tickers with support for searching and filtering.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| skip | int | 0 | Number of records to skip |
| limit | int | 100 | Max records to return |
| search | string | null | Search by symbol or name |
| index | string | null | Filter by index code |
| sector | string | null | Filter by sector |

**Response:**
```json
{
  "total": 850,
  "data": [
    {
      "symbol": "BBCA",
      "name": "Bank Central Asia Tbk",
      "sector": "Financials",
      "industry": "Banks",
      "index": "IDX"
    }
  ]
}
```

---

## 5. Ticker Details & Historical Data

### GET /tickers/{symbol}

Returns the ticker profile and the most recent fundamental metrics.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| symbol | string | Stock symbol (e.g., "BBCA") |

**Response:**
```json
{
  "symbol": "BBCA",
  "name": "Bank Central Asia Tbk",
  "sector": "Financials",
  "key_metrics": {
    "market_cap": 950000000000000,
    "pe_ratio": 25.5,
    "pbv": 4.2,
    "dividend_yield": 1.2,
    "eps": 356.0,
    "roe": 16.8,
    "observation_date": "2026-04-01"
  }
}
```

**Error Response:**
```json
{
  "error": "Ticker not found"
}
```

---

### GET /tickers/{symbol}/chart

Unified time-series data for the Ticker Details page (Price + Indicators).

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| symbol | string | Stock symbol |

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| range | string | "1Y" | Preset range: 1M, 3M, 6M, 1Y, 5Y, ALL |
| ma_periods | string | "20,50,200" | Comma-separated Moving Average periods |

**Response:**
```json
{
  "symbol": "BBCA",
  "range": "1Y",
  "data": [
    {
      "date": "2026-04-01",
      "price": {
        "open": 9050,
        "high": 9125,
        "low": 9000,
        "close": 9100,
        "volume": 15234000
      },
      "indicators": {
        "ma_20": 9025.5,
        "ma_50": 8950.0,
        "rsi_14": 58.42,
        "macd": {
          "value": 45.3,
          "signal": 42.1,
          "histogram": 3.2
        }
      }
    }
  ]
}
```

---

## 6. Screener (Future)

### GET /screener

Screen stocks based on technical presets. The first implementation will focus on bullish divergence.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| preset | string | Yes | Preset name: "bullish_divergence" |

**Response:**
```json
{
  "preset": "bullish_divergence",
  "results": [
    { "symbol": "ASII", "name": "Astra International Tbk" }
  ]
}
```

---

## Health

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
}
```

---

### GET /

Root endpoint with API info.

**Response:**
```json
{
  "message": "StockHub API",
  "version": "1.1.0"
}
```

---

## Error Responses

All endpoints follow standard error format:

```json
{
  "detail": "Error message"
}
```

For validation errors:
```json
{
  "detail": [
    {
      "loc": ["query", "range"],
      "msg": "invalid range value",
      "type": "value_error"
    }
  ]
}
```

---

## Implementation Notes for Backend

### Route Prefix
All routes must be prefixed with `/api/v1`.

### CORS
Allow origins from `http://localhost:3000` for development.

### Key Metrics
Key metrics should be fetched from a reliable data source. If not available, return `null` for missing values.

### Time-Series Focus
The `/chart` endpoint combines data from `prices` and `technical_indicators` based on the date. This avoids making multiple requests for a single chart.

### Latest Snapshot
Because `key_metrics` is now a time-series table, the `/tickers/{symbol}` endpoint must query the most recent record by `observation_date`.

### Async Processing
The `sync_jobs` table must be updated incrementally so the `/sync/progress` endpoint can return live percentages to the frontend.

---

## Implementation Notes for Frontend

### Environment Variable
Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`

### Landing Page Components
- **Hero Section**: Use `GET /stats` for ticker count, indexes count, last global sync
- **Sync Section**: Use `POST /sync/start` to start sync, `GET /sync/progress` for progress polling

### Tickers Page
- Use `GET /tickers` with `search`, `index`, `sector` filters

### Ticker Details Page
- Use `GET /tickers/{symbol}` for ticker profile and key metrics
- Use `GET /tickers/{symbol}/chart` for chart data (price + indicators)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2.0 | 2026-04-02 | Added `/indexes` and `/screener` endpoints, added `industry` field to tickers, expanded key_metrics (pbv, dividend_yield, roe), added `sync_id` and `estimated_remaining_seconds` to sync progress, renamed `ma` to `ma_periods`, added `range` to chart response |
| 0.1.1 | 2026-04-02 | Simplified sync endpoints, nested price/indicators in chart, streamlined ticker details |
| 0.1.0 | 2026-04-01 | Initial contract |