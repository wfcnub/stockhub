# StockHub

A stock analysis platform with historical price data, technical indicators, and stock screening capabilities. Currently supports Jakarta Composite Index (IDX) with extensible architecture for other exchanges.

## Tech Stack

- **Backend**: FastAPI (Python 3.11+)
- **Frontend**: Next.js 14 (TypeScript)
- **Database**: PostgreSQL (production) / SQLite (local dev)
- **Charts**: Lightweight Charts
- **Data Source**: Yahoo Finance (yfinance)

## Project Structure

```
stockhub/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py            # Entry point
│   │   ├── config.py          # Settings
│   │   ├── models/            # SQLAlchemy models
│   │   ├── routers/           # API endpoints
│   │   ├── services/          # Business logic
│   │   └── db/                # Database config
│   ├── indicators/             # Technical indicator library
│   │   ├── base.py            # Abstract base class
│   │   ├── registry.py        # Indicator registry
│   │   ├── moving_averages.py # SMA, EMA
│   │   ├── macd.py
│   │   ├── rsi.py
│   │   └── vwap.py
│   ├── .env                   # Backend environment variables
│   └── requirements.txt
├── frontend/                   # Next.js frontend
│   ├── src/
│   │   ├── app/               # App router pages
│   │   │   ├── page.tsx       # Home page
│   │   │   ├── tickers/       # Tickers list & details
│   │   │   │   ├── page.tsx   # Tickers list
│   │   │   │   └── [symbol]/  # Ticker details
│   │   │   └── screener/      # Screener (Coming Soon)
│   │   ├── components/        # React components
│   │   │   ├── landing/       # Hero, Sync, Feature boxes
│   │   │   ├── ticker/        # KeyMetrics, Charts
│   │   │   ├── charts/        # Chart components
│   │   │   └── screener/      # Screener components
│   │   ├── lib/               # API client
│   │   └── types/             # TypeScript types
│   ├── .env.local             # Frontend environment variables
│   └── package.json
├── start.sh                   # Quick start script (all services)
├── stop.sh                    # Stop all services
├── API_CONTRACT.md            # API contract v0.2.0
├── DB_DESIGN.md               # Database design v0.2.0
└── docker-compose.yml         # Local dev services
```

## Prerequisites

- **Python 3.11+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **Docker** (optional, for PostgreSQL) - [Download Docker](https://www.docker.com/)

## Quick Start

### Option 1: Using Startup Script (Recommended)

The easiest way to start all services:

```bash
# Start all services (database, backend, frontend)
./start.sh

# Stop all services
./stop.sh
```

The script will:
1. Create `.env` files if they don't exist
2. Start PostgreSQL with Docker (if available) or use SQLite
3. Install Python and Node.js dependencies
4. Start backend on http://localhost:8000
5. Start frontend on http://localhost:3000

**Default Configuration:**
- Uses SQLite by default (no Docker required)
- Automatically switches to PostgreSQL if Docker is available
- Creates environment files with sensible defaults

### Option 2: Manual Setup

#### 1. Start Database (Optional - PostgreSQL for full dev)

```bash
docker-compose up -d db
```

Or use SQLite for lightweight local dev (default, no setup required).

#### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations (when implemented)
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

#### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Access the app at http://localhost:3000

## API Endpoints (v0.2.0)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/stats` | GET | Platform statistics (hero section) |
| `/api/v1/indexes` | GET | List available indexes |
| `/api/v1/tickers` | GET | List tickers with pagination/search |
| `/api/v1/tickers/{symbol}` | GET | Ticker details with key metrics |
| `/api/v1/tickers/{symbol}/chart` | GET | Unified chart data (price + indicators) |
| `/api/v1/sync/start` | POST | Start background sync job |
| `/api/v1/sync/progress` | GET | Poll sync progress |
| `/api/v1/screener` | GET | Stock screener (future) |
| `/api/v1/health` | GET | Health check |

See [API_CONTRACT.md](./API_CONTRACT.md) for detailed request/response schemas.

## Frontend Pages

### Home Page (`/`)
- **HeroSection**: Displays total tickers, indexes, last global sync
- **SyncSection**: Index selection, sync trigger, progress polling with progress bar
- **FeatureBoxes**: Navigation cards to features

### Tickers List (`/tickers`)
- Searchable table of all tickers
- Filter by index
- Pagination support
- Links to ticker details

### Ticker Details (`/tickers/{symbol}`)
- **Key Metrics**: P/E Ratio, PBV, Market Cap, Dividend Yield, EPS, ROE
- **Price Chart**: Candlestick with MA overlays (20, 50, 200)
- **Technical Indicators**: RSI and MACD charts
- Time range selector (1M, 3M, 6M, 1Y, 5Y, ALL)

### Screener (`/screener`)
- Coming Soon placeholder
- Planned: Bullish/Bearish divergence detection, custom filters

## Technical Indicators

Pre-calculated during sync:
- **Moving Averages**: SMA & EMA (5, 10, 15, 20, 50, 100, 200 days)
- **MACD**: Standard (12, 26, 9)
- **RSI**: Standard (14 days)
- **VWAP**: Daily

### Adding New Indicators

1. Create a new file in `backend/indicators/`
2. Extend `BaseIndicator` class
3. Use `@register_indicator` decorator

```python
@register_indicator
class MyIndicator(BaseIndicator):
    name = "my_indicator"
    required_columns = ["close"]
    
    def get_required_history_days(self) -> int:
        return 30
    
    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        # Your calculation logic
        pass
```

## Environment Variables

Environment files are created automatically by `start.sh`, or you can create them manually:

**Backend (`backend/.env`):**
```env
# Database Configuration
# Use SQLite for local development (no Docker needed)
DATABASE_URL=sqlite:///./stockhub.db

# Or use PostgreSQL (requires Docker):
# DATABASE_URL=postgresql://stockhub:stockhub_dev@localhost:5432/stockhub

# CORS Origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Active exchanges (comma-separated)
ACTIVE_EXCHANGES=IDX
```

**Frontend (`frontend/.env.local`):**
```env
# Backend API URL (includes /api/v1 path)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Database Schema (v0.2.0)

See [DB_DESIGN.md](./DB_DESIGN.md) for the complete database schema including:
- `tickers` - Stock ticker information
- `prices` - Historical OHLCV data
- `technical_indicators` - Pre-calculated indicators
- `key_metrics` - Fundamental data (P/E, Market Cap, etc.)
- `index_info` - Market index metadata
- `sync_jobs` - Sync job tracking with progress

## Extending to Other Markets

Currently configured for Jakarta Composite Index (JK). To add other markets:

1. Update `app/data_downloader.py` to remove `.JK` suffix or make it configurable
2. Add exchange column to tickers table (already included)
3. Seed tickers for the new market

## License

MIT