import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app import __version__
from app.config import settings
from app.db.database import SessionLocal, engine
from app.routers import divergences, indexes, indicators, prices, stats, sync, tickers, triangles

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Jobs left `in_progress` by a crashed or restarted worker are marked failed on startup.
    try:
        from app.sync.runner import recover_stale_jobs

        recover_stale_jobs(SessionLocal)
    except Exception:
        logger.warning("Stale sync job recovery skipped (database unavailable?)", exc_info=True)
    yield


app = FastAPI(
    title="StockHub API",
    description="API for stock data management and technical analysis",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API v1 endpoints
app.include_router(stats.router, prefix="/api/v1", tags=["stats"])
app.include_router(indexes.router, prefix="/api/v1", tags=["indexes"])
app.include_router(tickers.router, prefix="/api/v1", tags=["tickers"])
app.include_router(prices.router, prefix="/api/v1", tags=["prices"])
app.include_router(indicators.router, prefix="/api/v1", tags=["indicators"])
app.include_router(divergences.router, prefix="/api/v1", tags=["divergences"])
app.include_router(triangles.router, prefix="/api/v1", tags=["triangles"])
app.include_router(sync.router, prefix="/api/v1", tags=["sync"])


@app.get("/")
async def root():
    return {"message": "StockHub API", "version": __version__}


@app.get("/health")
def health():
    """Liveness + DB check for the container healthcheck and monitoring.

    200 {"status": "healthy"} only when the database answers; otherwise 503.
    Sync def on purpose: FastAPI runs it in the threadpool, so a slow DB never blocks the loop.
    """
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unavailable")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "detail": "database unavailable"},
        )
    return {"status": "healthy"}
