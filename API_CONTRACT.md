# StockHub API Contract (v0.2.4)

> **Source of Truth** - This document defines the API contract. Backend must implement these endpoints. Frontend must consume these endpoints.

**Base URL**: `http://localhost:8000/api/v1`

---

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stats` | GET | Platform statistics for the Hero section |
| `/indexes` | GET | List all indexes with optional filtering |
| `/indexes` | POST | Create a new index |
| `/indexes/{index_id}` | GET | Get a single index by ID |
| `/indexes/{index_id}` | PATCH | Update an index (partial update) |
| `/indexes/{index_id}` | DELETE | Delete an index (soft or hard delete) |
| `/tickers` | GET | List tickers with pagination and search |
| `/tickers/{symbol}` | GET | Ticker profile and the latest fundamental metrics |
| `/tickers/{symbol}/chart` | GET | Unified Price + Technical Indicator historical data |
| `/sync/start` | POST | Trigger a background sync job for an index |
| `/sync/progress` | GET | Poll the real-time progress of a sync job |
| `/sync/stop` | POST | Stop an active sync job |
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

## 2. Index Management

### GET /indexes

Lists all indexes with optional filtering.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| is_active | boolean | null | Filter by active status (true/false) |

**Response:**
```json
{
  "total": 2,
  "data": [
    {
      "id": 1,
      "code": "IDX",
      "name": "Jakarta Composite Index",
      "yfinance_suffix": ".JK",
      "ticker_count": 850,
      "is_active": true,
      "last_synced_at": "2026-04-06T10:30:00Z",
      "created_at": "2026-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "code": "LQ45",
      "name": "LQ45 Index",
      "yfinance_suffix": "",
      "ticker_count": 45,
      "is_active": true,
      "last_synced_at": null,
      "created_at": "2026-04-06T12:00:00Z"
    }
  ]
}
```

---

### GET /indexes/{index_id}

Get a single index by ID.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| index_id | integer | Index ID |

**Response:**
```json
{
  "id": 1,
  "code": "IDX",
  "name": "Jakarta Composite Index",
  "yfinance_suffix": ".JK",
  "ticker_count": 850,
  "is_active": true,
  "last_synced_at": "2026-04-06T10:30:00Z",
  "created_at": "2026-01-01T00:00:00Z"
}
```

**Error Response (404):**
```json
{
  "detail": "Index with id 999 not found"
}
```

---

### POST /indexes

Create a new index.

**Request Body:**
```json
{
  "code": "LQ45",
  "name": "LQ45 Index",
  "yfinance_suffix": ".JK"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Unique index code (will be uppercased) |
| name | string | Yes | Display name |
| yfinance_suffix | string | No | Yahoo Finance suffix (e.g., ".JK" for IDX) |

**Response (200):**
```json
{
  "id": 2,
  "code": "LQ45",
  "name": "LQ45 Index",
  "yfinance_suffix": ".JK",
  "ticker_count": 0,
  "is_active": true,
  "last_synced_at": null,
  "created_at": "2026-04-06T12:00:00Z"
}
```

**Error Response (400 - Duplicate):**
```json
{
  "detail": "Index with code 'LQ45' already exists"
}
```

---

### PATCH /indexes/{index_id}

Update an existing index. Supports partial updates.

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| index_id | integer | Index ID |

**Request Body:**
```json
{
  "code": "IDX",
  "name": "Updated Index Name",
  "yfinance_suffix": ".JK",
  "is_active": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | No | New unique index code (will be uppercased) |
| name | string | No | New display name |
| yfinance_suffix | string | No | Yahoo Finance suffix |
| is_active | boolean | No | Active status |

**Response:**
```json
{
  "id": 1,
  "code": "IDX",
  "name": "Updated Index Name",
  "yfinance_suffix": ".JK",
  "ticker_count": 850,
  "is_active": false,
  "last_synced_at": "2026-04-06T10:30:00Z",
  "created_at": "2026-01-01T00:00:00Z"
}
```

**Error Response (404):**
```json
{
  "detail": "Index with id 999 not found"
}
```

---

### DELETE /indexes/{index_id}

Delete an index. By default performs a soft delete (sets `is_active=false`).

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| index_id | integer | Index ID |

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| hard_delete | boolean | false | Permanently delete the index and all associated tickers |

**Response (Soft Delete):**
```json
{
  "deleted": true,
  "hard_delete": false,
  "id": 1,
  "code": "IDX",
  "is_active": false,
  "message": "Index 'IDX' deactivated (soft delete). Use hard_delete=true to permanently remove."
}
```

**Response (Hard Delete):**
```json
{
  "deleted": true,
  "hard_delete": true,
  "id": 1,
  "code": "IDX",
  "message": "Index 'IDX' permanently deleted along with 850 associated tickers"
}
```

**Error Response (404):**
```json
{
  "detail": "Index with id 999 not found"
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

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sync_id | string | No | If omitted, backend returns the latest active sync job |

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

**Status values:** `pending`, `in_progress`, `completed`, `failed`, `cancelled`

---

### POST /sync/stop

Stops an active sync job.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sync_id | string | No | If omitted, backend stops the latest active sync job |

**Response:**
```json
{
  "sync_id": "sync_20260401_103000",
  "status": "cancelled",
  "message": "Sync stopped successfully"
}
```

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
- **Settings Menu (Index Management)**: Use `POST /indexes` to add index and `DELETE /indexes/{index_id}?hard_delete=true` to permanently delete after confirmation

### Tickers Page
- Use `GET /tickers` with `search`, `index`, `sector` filters

### Ticker Details Page
- Use `GET /tickers/{symbol}` for ticker profile and key metrics
- Use `GET /tickers/{symbol}/chart` for chart data (price + indicators)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2.4 | 2026-04-06 | Added `yfinance_suffix` field to indexes. Added `code` field to `PATCH /indexes/{index_id}` to allow updating index code. Updated all index responses to include `yfinance_suffix`. |
| 0.2.3 | 2026-04-06 | Removed duplicate `GET /indexes` from stats router (now only available under indexes router). Index management is consolidated in the `/indexes` endpoints. |
| 0.2.2 | 2026-04-06 | Implemented full Index CRUD API: `GET /indexes`, `GET /indexes/{index_id}`, `POST /indexes`, `PATCH /indexes/{index_id}`, `DELETE /indexes/{index_id}` with soft/hard delete support. Updated response format to include `ticker_count`, `last_synced_at`, `created_at`. Removed assumption notes as endpoints are now implemented. |
| 0.2.1 | 2026-04-06 | Documented frontend assumption for `POST /indexes` and `DELETE /indexes/{index_code}`; assumed response envelope matches `GET /indexes` |
| 0.2.0 | 2026-04-02 | Added `/indexes` and `/screener` endpoints, added `industry` field to tickers, expanded key_metrics (pbv, dividend_yield, roe), added `sync_id` and `estimated_remaining_seconds` to sync progress, renamed `ma` to `ma_periods`, added `range` to chart response |
| 0.1.1 | 2026-04-02 | Simplified sync endpoints, nested price/indicators in chart, streamlined ticker details |
| 0.1.0 | 2026-04-01 | Initial contract |