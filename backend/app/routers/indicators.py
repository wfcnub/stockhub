from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.models.indicator import TechnicalIndicator
from app.models.ticker import Ticker

router = APIRouter(prefix="/indicators", tags=["indicators"])


@router.get("/{ticker_symbol}")
def get_indicators(
    ticker_symbol: str,
    indicator_type: Optional[str] = Query(
        None,
        description="Filter by indicator type: sma, ema, macd, rsi, vwap"
    ),
    window_period: Optional[int] = Query(
        None,
        description="Filter by window period (e.g., 14 for RSI, 20 for SMA)"
    ),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """
    Get technical indicators for a ticker.

    - **ticker_symbol**: Stock symbol (e.g., 'BBCA')
    - **indicator_type**: Optional filter - sma, ema, macd, rsi, vwap
    - **window_period**: Optional filter for MA periods
    """
    ticker = db.query(Ticker).filter(Ticker.symbol == ticker_symbol.upper()).first()
    if not ticker:
        return {"error": "Ticker not found"}

    query = db.query(TechnicalIndicator).filter(
        TechnicalIndicator.ticker_id == ticker.id
    )

    if indicator_type:
        query = query.filter(TechnicalIndicator.indicator_type == indicator_type.lower())

    if window_period:
        query = query.filter(TechnicalIndicator.window_period == window_period)

    indicators = query.order_by(
        TechnicalIndicator.date.desc()
    ).limit(limit).all()

    return {
        "ticker": ticker_symbol.upper(),
        "indicators": [
            {
                "date": ind.date.isoformat(),
                "indicator_type": ind.indicator_type,
                "window_period": ind.window_period,
                "value": float(ind.value) if ind.value else None,
                "extra_data": ind.extra_data
            }
            for ind in indicators
        ]
    }


@router.get("/{ticker_symbol}/latest")
def get_latest_indicators(
    ticker_symbol: str,
    db: Session = Depends(get_db)
):
    """
    Get the most recent indicator values for a ticker.
    Returns the latest computed values for all indicator types.
    """
    ticker = db.query(Ticker).filter(Ticker.symbol == ticker_symbol.upper()).first()
    if not ticker:
        return {"error": "Ticker not found"}

    # Get latest date for this ticker's indicators
    latest_date = db.query(TechnicalIndicator.date).filter(
        TechnicalIndicator.ticker_id == ticker.id
    ).order_by(TechnicalIndicator.date.desc()).first()

    if not latest_date:
        return {"ticker": ticker_symbol.upper(), "date": None, "indicators": []}

    latest_date = latest_date[0]

    # Get all indicators for that date
    indicators = db.query(TechnicalIndicator).filter(
        TechnicalIndicator.ticker_id == ticker.id,
        TechnicalIndicator.date == latest_date
    ).all()

    return {
        "ticker": ticker_symbol.upper(),
        "date": latest_date.isoformat(),
        "indicators": [
            {
                "indicator_type": ind.indicator_type,
                "window_period": ind.window_period,
                "value": float(ind.value) if ind.value else None,
                "extra_data": ind.extra_data
            }
            for ind in indicators
        ]
    }


@router.get("/available-types")
def get_available_indicator_types():
    """List all available indicator types that can be computed"""
    return {
        "indicator_types": [
            {
                "type": "sma",
                "name": "Simple Moving Average",
                "default_periods": [5, 10, 15, 20, 50, 100, 200]
            },
            {
                "type": "ema",
                "name": "Exponential Moving Average",
                "default_periods": [5, 10, 15, 20, 50, 100, 200]
            },
            {
                "type": "macd",
                "name": "MACD (Moving Average Convergence Divergence)",
                "default_periods": [9],  # Signal line period
                "params": {"fast": 12, "slow": 26}
            },
            {
                "type": "rsi",
                "name": "Relative Strength Index",
                "default_periods": [14]
            },
            {
                "type": "vwap",
                "name": "Volume Weighted Average Price",
                "default_periods": None  # Daily calculation
            }
        ]
    }