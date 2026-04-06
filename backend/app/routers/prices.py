from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.db.database import get_db
from app.models.price import DailyPrice
from app.models.ticker import Ticker

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("/{symbol}")
def get_price_history(
    symbol: str,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """Get historical price data for a ticker"""

    ticker = db.query(Ticker).filter(Ticker.symbol == symbol.upper()).first()
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Ticker {symbol} not found")

    query = db.query(DailyPrice).filter(DailyPrice.ticker_id == ticker.id)

    if start_date:
        query = query.filter(DailyPrice.date >= start_date)
    if end_date:
        query = query.filter(DailyPrice.date <= end_date)

    prices = query.order_by(DailyPrice.date).all()

    return {
        "ticker": {
            "symbol": ticker.symbol,
            "name": ticker.name
        },
        "data": [
            {
                "date": p.date.isoformat(),
                "open": float(p.open) if p.open else None,
                "high": float(p.high) if p.high else None,
                "low": float(p.low) if p.low else None,
                "close": float(p.close),
                "volume": int(p.volume) if p.volume else None,
                "adj_close": float(p.adj_close) if p.adj_close else None
            }
            for p in prices
        ],
        "count": len(prices)
    }


@router.get("/{symbol}/latest")
def get_latest_price(
    symbol: str,
    db: Session = Depends(get_db)
):
    """Get the latest price for a ticker"""

    ticker = db.query(Ticker).filter(Ticker.symbol == symbol.upper()).first()
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Ticker {symbol} not found")

    price = db.query(DailyPrice).filter(
        DailyPrice.ticker_id == ticker.id
    ).order_by(DailyPrice.date.desc()).first()

    if not price:
        raise HTTPException(status_code=404, detail="No price data available")

    return {
        "ticker": {
            "symbol": ticker.symbol,
            "name": ticker.name
        },
        "data": {
            "date": price.date.isoformat(),
            "open": float(price.open),
            "high": float(price.high),
            "low": float(price.low),
            "close": float(price.close),
            "volume": int(price.volume),
            "adj_close": float(price.adj_close) if price.adj_close else None
        }
    }