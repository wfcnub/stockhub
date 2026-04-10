# StockHub API Contract (v1.0.0)

> **Source of Truth** - This document defines the API contract. Backend must implement these endpoints. Frontend must consume these endpoints.

**Base URL**: `http://localhost:8000/api/v1`

---

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stats` | GET | Platform statistics for the hero section |
| `/screener` | GET | Generic stock screener (preset or custom filters) |
| `/indexes` | GET | List all indexes with optional filtering |
| `/indexes` | POST | Create a new index |
| `/indexes/{index_id}` | GET | Get a single index by ID |
| `/indexes/{index_id}` | PATCH | Update an index (partial update) |
| `/indexes/{index_id}` | DELETE | Delete an index (soft or hard delete) |
| `/tickers` | GET | List tickers with pagination, filters, and sorting |
| `/tickers/{symbol}` | GET | Ticker profile and latest key metrics |
| `/tickers/{symbol}/chart` | GET | Unified price + indicator historical data |
| `/prices/{symbol}` | GET | Raw historical OHLCV data |
| `/prices/{symbol}/latest` | GET | Latest OHLCV snapshot |
| `/indicators/{ticker_symbol}` | GET | Indicator time series for a ticker |
| `/indicators/{ticker_symbol}/latest` | GET | Latest indicator set for a ticker |
| `/indicators/available-types` | GET | Available indicator metadata and defaults |
| `/charts/{ticker_symbol}/divergences` | GET | Divergence events for ticker overlays |
| `/screener/divergences` | GET | Market-level divergence screener |
| `/sync/start` | POST | Trigger a background sync job |
| `/sync/progress` | GET | Poll sync progress |
| `/sync/stop` | POST | Stop active sync job |
| `/sync/init-index` | POST | Create an index record for sync workflows |
| `/sync/discover/{index_code}` | POST | Discover/sync index constituents only |
| `/sync/status/{symbol}` | GET | Get per-ticker sync status |

Non-prefixed utility endpoints:
- `GET /health`
- `GET /`

---

## 1. Platform Statistics

### GET /stats

Returns aggregate data for the landing page hero section.

**Response:**
```json
{
  "total_tickers": 850,
  "total_indexes": 2,
  "last_global_sync": "2026-04-01T10:30:00+00:00",
  "indexes": [
    {
      "code": "JCI",
      "name": "Jakarta Composite Index",
      "yfinance_suffix": ".JK",
      "ticker_count": 850,
      "last_sync": "2026-04-01T10:30:00+00:00"
    }
  ]
}
```

---

## 2. Screener

### GET /screener

Screens stocks using a preset or ad hoc filters.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| preset | string | null | Preset name (`bullish_divergence`) |
| min_price | float | null | Minimum latest close |
| max_price | float | null | Maximum latest close |
| min_volume | int | null | Minimum latest volume |
| sector | string | null | Sector name contains filter |
| min_pe | float | null | Minimum P/E ratio |
| max_pe | float | null | Maximum P/E ratio |
| min_market_cap | float | null | Minimum market cap |
| max_market_cap | float | null | Maximum market cap |
| limit | int | 50 | Max rows (1-500) |

**Response (preset mode):**
```json
{
  "preset": "bullish_divergence",
  "results": []
}
```

**Response (custom filter mode):**
```json
{
  "total": 132,
  "results": [
    {
      "symbol": "BBCA",
      "name": "Bank Central Asia Tbk",
      "sector": "Financials",
      "latest_close": 9100,
      "latest_volume": 15234000
    }
  ]
}
```

---

## 3. Index Management

### GET /indexes

Lists indexes with optional active filter.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| is_active | boolean | null | Filter by active state |

**Response:**
```json
{
  "total": 2,
  "data": [
    {
      "id": 1,
      "code": "JCI",
      "name": "Jakarta Composite Index",
      "yfinance_suffix": ".JK",
      "ticker_count": 850,
      "is_active": true,
      "last_synced_at": "2026-04-06T10:30:00+00:00",
      "created_at": "2026-01-01T00:00:00+00:00"
    }
  ]
}
```

### GET /indexes/{index_id}

Gets one index by numeric ID.

**Error (404):**
```json
{ "detail": "Index with id 999 not found" }
```

### POST /indexes

Creates a new index.

**Request Body:**
```json
{
  "code": "LQ45",
  "name": "LQ45 Index",
  "yfinance_suffix": ".JK"
}
```

**Error (400 duplicate):**
```json
{ "detail": "Index with code 'LQ45' already exists" }
```

### PATCH /indexes/{index_id}

Partially updates index fields.

**Request Body Fields:**
- `code?: string`
- `name?: string`
- `yfinance_suffix?: string`
- `is_active?: boolean`

### DELETE /indexes/{index_id}

Deletes index.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| hard_delete | boolean | false | Permanent delete (cascade) if true |

**Response (soft):**
```json
{
  "deleted": true,
  "hard_delete": false,
  "id": 1,
  "code": "JCI",
  "is_active": false,
  "message": "Index 'JCI' deactivated (soft delete). Use hard_delete=true to permanently remove."
}
```

**Response (hard):**
```json
{
  "deleted": true,
  "hard_delete": true,
  "id": 1,
  "code": "JCI",
  "message": "Index 'JCI' permanently deleted along with 850 associated tickers"
}
```

---

## 4. Ticker Endpoints

### GET /tickers

Lists tickers with filtering, sorting, and pagination.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| offset | int | 0 | Number of rows to skip (canonical) |
| skip | int | null | Alias for `offset` |
| limit | int | 50 | Max rows (1-500) |
| search | string | null | Match symbol or name |
| index | string | null | Index code filter |
| sector | string | null | Sector contains filter |
| sort_by | string | `symbol` | `symbol` or `name` |
| sort_order | string | `asc` | `asc` or `desc` |

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
      "index": "JCI"
    }
  ]
}
```

### GET /tickers/{symbol}

Returns ticker profile and latest key metrics (if available).

**Response:**
```json
{
  "symbol": "BBCA",
  "name": "Bank Central Asia Tbk",
  "sector": "Financials",
  "industry": "Banks",
  "index": "JCI",
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

**Error (404):**
```json
{ "detail": "Ticker not found" }
```

### GET /tickers/{symbol}/chart

Returns unified chart data (prices + indicators by date).

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| range | string | `ALL` | `1M`, `3M`, `6M`, `1Y`, `5Y`, `ALL` |
| ma_periods | string | `10,15,20,50,100,200` | CSV periods parsed as integers |

**Response:**
```json
{
  "symbol": "BBCA",
  "range": "ALL",
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

Notes:
- Unknown `range` values currently fall back to `ALL` behavior.
- Missing chart data returns 404 with `detail`.

---

## 5. Price Endpoints

### GET /prices/{symbol}

Returns raw OHLCV history for a ticker.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| start_date | date | null | Inclusive start date (`YYYY-MM-DD`) |
| end_date | date | null | Inclusive end date (`YYYY-MM-DD`) |

**Response:**
```json
{
  "ticker": {
    "symbol": "BBCA",
    "name": "Bank Central Asia Tbk"
  },
  "data": [
    {
      "date": "2026-04-01",
      "open": 9050,
      "high": 9125,
      "low": 9000,
      "close": 9100,
      "volume": 15234000,
      "adj_close": 9100
    }
  ],
  "count": 1
}
```

### GET /prices/{symbol}/latest

Returns most recent OHLCV row.

**Response:**
```json
{
  "ticker": {
    "symbol": "BBCA",
    "name": "Bank Central Asia Tbk"
  },
  "data": {
    "date": "2026-04-01",
    "open": 9050,
    "high": 9125,
    "low": 9000,
    "close": 9100,
    "volume": 15234000,
    "adj_close": 9100
  }
}
```

Possible errors:
- `404`: `Ticker {symbol} not found`
- `404`: `No price data available`

---

## 6. Indicator Endpoints

### GET /indicators/{ticker_symbol}

Returns indicator history for one ticker.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| indicator_type | string | null | `sma`, `ema`, `macd`, `rsi`, `vwap` |
| window_period | int | null | Period filter (e.g., 14, 20) |
| limit | int | 100 | Max rows (<=500) |

**Response:**
```json
{
  "ticker": "BBCA",
  "indicators": [
    {
      "date": "2026-04-01",
      "indicator_type": "rsi",
      "window_period": 14,
      "value": 58.42,
      "extra_data": null
    }
  ]
}
```

### GET /indicators/{ticker_symbol}/latest

Returns all indicator rows for the latest available indicator date.

**Response (no indicator rows yet):**
```json
{
  "ticker": "BBCA",
  "date": null,
  "indicators": []
}
```

### GET /indicators/available-types

Returns static supported indicator metadata.

**Response:**
```json
{
  "indicator_types": [
    {
      "type": "sma",
      "name": "Simple Moving Average",
      "default_periods": [5, 10, 15, 20, 50, 100, 200]
    },
    {
      "type": "macd",
      "name": "MACD (Moving Average Convergence Divergence)",
      "default_periods": [9],
      "params": {"fast": 12, "slow": 26}
    }
  ]
}
```

Legacy behavior note:
- Indicator endpoints currently return `{ "error": "Ticker not found" }` for unknown symbols.

---

## 7. Divergence Endpoints

### GET /charts/{ticker_symbol}/divergences

Returns divergence events for chart overlays for a single ticker.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| pivot_left_window | int | 5 | Left bars required for pivot (1-20) |
| confirmed_right_min | int | 2 | Confirmed min right bars (0-10) |
| confirmed_right_max | int | 5 | Confirmed max right bars (0-10) |
| aggressive_right_min | int | 0 | Aggressive min right bars (0-10) |
| aggressive_right_max | int | 1 | Aggressive max right bars (0-10) |

**Parameter Constraints:**
- `confirmed_right_min <= confirmed_right_max`
- `aggressive_right_min <= aggressive_right_max`
- `confirmed_right_min > aggressive_right_max` (no overlap)

**Response:**
```json
{
  "symbol": "BBCA",
  "events": [
    {
      "strategy_type": "BULLISH_CONFIRMED",
      "type": "regular",
      "logic_type": "regular",
      "line_style": "dashed",
      "color_hex": "#22C55E",
      "grade": "oversold",
      "confirmation_degree": 3,
      "p1": {
        "timestamp": 1775166000,
        "low": 8800,
        "rsi_14": 28.5
      },
      "p2": {
        "timestamp": 1775433600,
        "low": 8650,
        "rsi_14": 35.2
      },
      "trough_timestamp": 1775433600,
      "confirmation_timestamp": 1775433600,
      "signal_timestamp": 1775433600,
      "invalidation_level": null,
      "action": "Confirmed divergence setup"
    }
  ]
}
```

### GET /screener/divergences

Returns recent divergence signals across market.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| days | int | 7 | Lookback window in days (1-30) |
| limit | int | 500 | Max rows (1-5000) |
| pivot_left_window | int | 5 | Left bars required for pivot (1-20) |
| confirmed_right_min | int | 2 | Confirmed min right bars (0-10) |
| confirmed_right_max | int | 5 | Confirmed max right bars (0-10) |
| aggressive_right_min | int | 0 | Aggressive min right bars (0-10) |
| aggressive_right_max | int | 1 | Aggressive max right bars (0-10) |

**Response:**
```json
{
  "lookback_days": 7,
  "count": 1,
  "results": [
    {
      "symbol": "BBCA",
      "name": "Bank Central Asia Tbk",
      "strategy_type": "BULLISH_AGGRESSIVE",
      "type": "regular",
      "logic_type": "regular",
      "line_style": "dotted",
      "color_hex": "#FFBF00",
      "grade": "neutral",
      "confirmation_degree": 1,
      "p1": {
        "timestamp": 1775166000,
        "low": 8800,
        "rsi_14": 28.5
      },
      "p2": {
        "timestamp": 1775433600,
        "low": 8650,
        "rsi_14": 35.2
      },
      "trough_timestamp": 1775433600,
      "confirmation_timestamp": 1775433600,
      "signal_timestamp": 1775433600,
      "invalidation_level": 8650,
      "action": "Potential Bottom - Monitor for Open Entry."
    }
  ]
}
```

---

## 8. Sync Operations

### POST /sync/start

Starts a background sync for one index.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| index_code | string | Yes | Index code to sync |
| start_date | string | No | Optional `YYYY-MM-DD` |

**Response:**
```json
{
  "sync_id": "sync_20260410_103000",
  "index_code": "JCI",
  "status": "in_progress",
  "message": "Sync started for JCI"
}
```

Notes:
- API returns `in_progress` immediately.
- DB row is created as `pending` and transitions in background worker.

### GET /sync/progress

Returns progress for one sync job.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sync_id | string | No | If omitted, latest active job is used |

**Response:**
```json
{
  "sync_id": "sync_20260410_103000",
  "status": "in_progress",
  "progress": {
    "total_tickers": 850,
    "processed_tickers": 425,
    "percent_complete": 50,
    "current_ticker": "BBCA",
    "estimated_remaining_seconds": 850
  }
}
```

Status values:
- Active: `pending`, `in_progress`
- Terminal: `completed`, `failed`, `cancelled`
- Legacy DB state `running` is normalized to `in_progress` in API responses.

### POST /sync/stop

Stops an active sync job.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sync_id | string | No | If omitted, latest active job is used |

**Response:**
```json
{
  "sync_id": "sync_20260410_103000",
  "status": "cancelled",
  "message": "Sync stopped successfully"
}
```

### POST /sync/init-index

Creates an index record for sync operations.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| code | string | Yes | Index code |
| name | string | Yes | Display name |
| yfinance_suffix | string | No | Yahoo Finance suffix |

### POST /sync/discover/{index_code}

Discovers and syncs ticker constituents for one index without price history sync.

### GET /sync/status/{symbol}

Returns per-ticker sync status summary.

**Response:**
```json
{
  "symbol": "BBCA",
  "name": "Bank Central Asia Tbk",
  "is_active": true,
  "last_sync_date": "2026-04-10",
  "last_sync_timestamp": "2026-04-10T10:30:00+00:00",
  "status": "completed"
}
```

---

## 9. Health and Root

### GET /health
```json
{ "status": "healthy" }
```

### GET /
```json
{
  "message": "StockHub API",
  "version": "1.0.0"
}
```

---

## 10. Error Responses

Standard error format:

```json
{ "detail": "Error message" }
```

Validation errors:

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

Known legacy deviation:
- Indicator endpoints return `{ "error": "Ticker not found" }` for unknown symbols.

---

## Implementation Notes for Backend

### Route Prefix
All public API routes are under `/api/v1`, except utility routes `/` and `/health`.

### CORS
Allow origins from `http://localhost:3000` for local development.

### Key Metrics Snapshot
`GET /tickers/{symbol}` should return the latest key metrics record by `observation_date`.

### Chart Aggregation
`GET /tickers/{symbol}/chart` merges rows from `prices` and `technical_indicators` by date.

### Sync Status Compatibility
Keep API status contract stable: normalize legacy DB status `running` to `in_progress`.

---

## Implementation Notes for Frontend

### Environment Variable
Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`.

### Key Integrations
- Hero: `GET /stats`
- Sync controls: `POST /sync/start`, `GET /sync/progress`, `POST /sync/stop`
- Ticker list: `GET /tickers`
- Ticker details + chart: `GET /tickers/{symbol}`, `GET /tickers/{symbol}/chart`
- Divergences: `GET /charts/{ticker_symbol}/divergences`, `GET /screener/divergences`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-10 | First stable contract release. Consolidated all implemented endpoints in docs (`/prices/*`, `/indicators/*`, sync operational routes), aligned ticker details with `industry`, documented screener dual response modes, and formalized sync status normalization (`running` -> `in_progress`). |
| 0.2.6 | 2026-04-10 | Added configurable divergence detection parameters: `pivot_left_window`, `confirmed_right_min`, `confirmed_right_max`, `aggressive_right_min`, `aggressive_right_max` to `/charts/{ticker_symbol}/divergences` and `/screener/divergences`. Added `confirmation_degree` field to divergence event responses. Events now return full structure with `p1`, `p2`, `color_hex`, `line_style`, and `action` fields. |
| 0.2.5 | 2026-04-10 | Aligned docs to implementation: `/sync/start` query params, ticker pagination defaults (`offset`/`skip`, `limit=50`, sorting), ticker error format (`detail`), chart defaults (`range=ALL`, expanded MA defaults), root version (`0.2.0`), and documented divergence endpoints (`/charts/{ticker_symbol}/divergences`, `/screener/divergences`). Standardized examples to `JCI`. |
| 0.2.4 | 2026-04-06 | Added `yfinance_suffix` field to indexes. Added `code` field to `PATCH /indexes/{index_id}` to allow updating index code. Updated all index responses to include `yfinance_suffix`. |
| 0.2.3 | 2026-04-06 | Removed duplicate `GET /indexes` from stats router (now only available under indexes router). Index management is consolidated in the `/indexes` endpoints. |
| 0.2.2 | 2026-04-06 | Implemented full Index CRUD API: `GET /indexes`, `GET /indexes/{index_id}`, `POST /indexes`, `PATCH /indexes/{index_id}`, `DELETE /indexes/{index_id}` with soft/hard delete support. Updated response format to include `ticker_count`, `last_synced_at`, `created_at`. Removed assumption notes as endpoints are now implemented. |
| 0.2.1 | 2026-04-06 | Documented frontend assumption for `POST /indexes` and `DELETE /indexes/{index_code}`; assumed response envelope matches `GET /indexes`. |
| 0.2.0 | 2026-04-02 | Added `/indexes` and `/screener` endpoints, added `industry` field to tickers, expanded key_metrics (pbv, dividend_yield, roe), added `sync_id` and `estimated_remaining_seconds` to sync progress, renamed `ma` to `ma_periods`, added `range` to chart response. |
| 0.1.1 | 2026-04-02 | Simplified sync endpoints, nested price/indicators in chart, streamlined ticker details. |
| 0.1.0 | 2026-04-01 | Initial contract. |
