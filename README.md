# StockHub (v1.0.0)

StockHub is a stock analysis platform with historical price data, technical indicators, sync orchestration, and divergence screening. It currently supports Jakarta Composite Index (IDX) and is designed to be extended to additional indexes/exchanges.

## Tech Stack

- **Backend**: FastAPI (Python 3.11+)
- **Frontend**: Next.js 14 (TypeScript)
- **Database**: PostgreSQL (production) / SQLite (local dev)
- **Charts**: Lightweight Charts
- **Data Source**: Yahoo Finance (`yfinance`)

## Project Structure

```text
stockhub/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py            # Entry point + router wiring
│   │   ├── config.py          # Settings
│   │   ├── models/            # SQLAlchemy models
│   │   ├── routers/           # API endpoints
│   │   ├── services/          # Business logic
│   │   ├── db/                # Database config
│   │   └── tools/             # Data source and ticker list fetchers
│   ├── indicators/            # Technical indicator library
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/                  # Next.js frontend
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   ├── components/        # React components
│   │   ├── lib/               # API client
│   │   └── types/             # TypeScript contract types
│   └── package.json
├── API_CONTRACT.md            # API contract v1.0.0
├── DB_DESIGN.md               # Database design v1.0.0
├── AGENTS.md                  # Agent workflow and guardrails
├── start.sh                   # Quick start script (all services)
├── stop.sh                    # Stop local services
└── docker-compose.yml         # Local dev services
```

## Prerequisites

- **Python 3.11+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **Docker** (optional, PostgreSQL local dev) - [Download Docker](https://www.docker.com/)

## Quick Start

### Option 1: Startup Script (Recommended)

```bash
# Start all services (database, backend, frontend)
./start.sh

# Stop all services
./stop.sh
```

The script will:
1. Create environment files if missing.
2. Start PostgreSQL with Docker when available (otherwise SQLite local dev).
3. Install Python and Node.js dependencies.
4. Start backend on `http://localhost:8000`.
5. Start frontend on `http://localhost:3000`.

### Option 2: Manual Setup

#### 1. Database (optional PostgreSQL)

```bash
docker-compose up -d db
```

Or use SQLite locally without Docker.

#### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Access the app at `http://localhost:3000`.

## API Endpoints (v1.0.0)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/stats` | GET | Platform statistics for the hero section |
| `/api/v1/screener` | GET | Generic screener filters and preset-based screeners |
| `/api/v1/indexes` | GET, POST | List/create indexes |
| `/api/v1/indexes/{index_id}` | GET, PATCH, DELETE | Get/update/delete index |
| `/api/v1/tickers` | GET | Ticker discovery with filters, sorting, pagination |
| `/api/v1/tickers/{symbol}` | GET | Ticker profile + latest key metrics |
| `/api/v1/tickers/{symbol}/chart` | GET | Unified price + indicators time-series |
| `/api/v1/prices/{symbol}` | GET | Raw price history by date range |
| `/api/v1/prices/{symbol}/latest` | GET | Latest price snapshot |
| `/api/v1/indicators/{ticker_symbol}` | GET | Indicator history for a ticker |
| `/api/v1/indicators/{ticker_symbol}/latest` | GET | Latest available indicator set |
| `/api/v1/indicators/available-types` | GET | Available indicator metadata |
| `/api/v1/charts/{ticker_symbol}/divergences` | GET | Ticker-level divergence events |
| `/api/v1/screener/divergences` | GET | Market-level divergence screener |
| `/api/v1/sync/start` | POST | Start background sync job |
| `/api/v1/sync/progress` | GET | Poll sync progress |
| `/api/v1/sync/stop` | POST | Stop active sync job |
| `/api/v1/sync/init-index` | POST | Initialize an index record |
| `/api/v1/sync/discover/{index_code}` | POST | Sync ticker constituents only |
| `/api/v1/sync/status/{symbol}` | GET | Per-ticker last sync status |
| `/health` | GET | Health check |
| `/` | GET | API metadata |

See [API_CONTRACT.md](./API_CONTRACT.md) for full request/response details.

## Frontend Pages

### Home (`/`)
- Hero statistics (`GET /stats`)
- Sync controls and progress polling (`POST /sync/start`, `GET /sync/progress`, `POST /sync/stop`)
- Feature navigation cards

### Tickers (`/tickers`)
- Searchable, sortable, paginated ticker list
- Filters by index and sector

### Ticker Details (`/tickers/{symbol}`)
- Latest key metrics (P/E, PBV, market cap, dividend yield, EPS, ROE)
- Price chart with MA overlays
- RSI and MACD panels
- Divergence overlays and parameterized detection controls

### Screener (`/screener`)
- Divergence screener across market
- Configurable detection windows

## Technical Indicators

Pre-calculated during sync:
- **Moving Averages**: SMA and EMA (5, 10, 15, 20, 50, 100, 200)
- **MACD**: Standard (12, 26, 9)
- **RSI**: Standard (14)
- **VWAP**: Daily

### Adding New Indicators

1. Add a new indicator implementation in `backend/indicators/`.
2. Extend `BaseIndicator`.
3. Register with `@register_indicator`.

```python
@register_indicator
class MyIndicator(BaseIndicator):
    name = "my_indicator"
    required_columns = ["close"]

    def get_required_history_days(self) -> int:
        return 30

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        ...
```

## Environment Variables

Environment files can be generated by `start.sh` or created manually.

**Backend (`backend/.env`)**

```env
# SQLite (default local dev)
DATABASE_URL=sqlite:///./stockhub.db

# PostgreSQL (optional local dev)
# DATABASE_URL=postgresql://stockhub:stockhub_dev@localhost:5432/stockhub

CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ACTIVE_EXCHANGES=IDX
```

**Frontend (`frontend/.env.local`)**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Database Schema (v1.0.0)

See [DB_DESIGN.md](./DB_DESIGN.md) for the complete schema:
- `indexes`
- `tickers`
- `prices`
- `key_metrics`
- `technical_indicators`
- `sync_status`
- `sync_jobs`

## Extending to Other Markets

To add another index/exchange:
1. Implement a ticker-list fetcher in `backend/app/tools/ticker_list_fetchers/`.
2. Register it in `backend/app/tools/ticker_list_fetchers/factory.py`.
3. Create/update index metadata with the proper `yfinance_suffix`.
4. Run `/api/v1/sync/discover/{index_code}` and `/api/v1/sync/start`.

## License

MIT