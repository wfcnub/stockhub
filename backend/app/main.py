from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import tickers, prices, indicators, sync, stats, indexes

app = FastAPI(
    title="StockHub API",
    description="API for stock data management and technical analysis",
    version="0.2.0",
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
app.include_router(sync.router, prefix="/api/v1", tags=["sync"])


@app.get("/")
async def root():
    return {"message": "StockHub API", "version": "0.2.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}