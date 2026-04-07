from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Optional
import json

from app.db.database import get_db
from app.models import Ticker, DailyPrice, KeyMetric, Index, TechnicalIndicator

router = APIRouter(prefix="/tickers", tags=["tickers"])


@router.get("/")
def get_tickers(
    search: Optional[str] = Query(None, description="Search by symbol or name"),
    index: Optional[str] = Query(None, description="Filter by index code"),
    sector: Optional[str] = Query(None, description="Filter by sector"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    skip: Optional[int] = Query(None, ge=0, description="Alias for offset"),
    sort_by: str = Query("symbol", description="Sort field: symbol or name"),
    sort_order: str = Query("asc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db)
):
    """
    Get all tickers with optional filters.

    Supports pagination and filtering by index, sector, and search.
    """
    query = db.query(Ticker).filter(Ticker.is_active == True)

    # Apply filters
    if index:
        index_obj = db.query(Index).filter(Index.code == index.upper()).first()
        if index_obj:
            query = query.filter(Ticker.index_id == index_obj.id)

    if sector:
        query = query.filter(Ticker.sector.ilike(f"%{sector}%"))

    if search:
        search_term = f"%{search.upper()}%"
        query = query.filter(
            or_(
                Ticker.symbol.ilike(search_term),
                Ticker.name.ilike(f"%{search}%")
            )
        )

    sort_field = sort_by.lower()
    sort_direction = sort_order.lower()

    if sort_field not in {"symbol", "name"}:
        raise HTTPException(status_code=400, detail="Invalid sort_by. Use 'symbol' or 'name'.")

    if sort_direction not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid sort_order. Use 'asc' or 'desc'.")

    sort_column = Ticker.symbol if sort_field == "symbol" else Ticker.name
    primary_sort = sort_column.desc() if sort_direction == "desc" else sort_column.asc()

    if sort_field == "name":
        query = query.order_by(primary_sort, Ticker.symbol.asc())
    else:
        query = query.order_by(primary_sort)

    effective_offset = skip if skip is not None else offset

    # Get total count before pagination
    total = query.count()

    # Apply pagination
    tickers = query.offset(effective_offset).limit(limit).all()

    return {
        "total": total,
        "data": [
            {
                "symbol": t.symbol,
                "name": t.name,
                "sector": t.sector,
                "industry": t.industry,
                "index": t.index.code if t.index else None
            }
            for t in tickers
        ]
    }


@router.get("/{symbol}")
def get_ticker(symbol: str, db: Session = Depends(get_db)):
    """
    Get ticker details by symbol.

    Includes the most recent fundamental metrics.
    """
    ticker = db.query(Ticker).filter(Ticker.symbol == symbol.upper()).first()
    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker not found")

    # Get latest key metrics
    latest_metrics = db.query(KeyMetric).filter(
        KeyMetric.ticker_id == ticker.id
    ).order_by(KeyMetric.observation_date.desc()).first()

    # Get index info
    index = db.query(Index).filter(Index.id == ticker.index_id).first()

    response = {
        "symbol": ticker.symbol,
        "name": ticker.name,
        "sector": ticker.sector,
        "industry": ticker.industry,
        "index": index.code if index else None
    }

    # Add key metrics if available
    if latest_metrics:
        response["key_metrics"] = {
            "market_cap": latest_metrics.market_cap,
            "pe_ratio": latest_metrics.pe_ratio,
            "pbv": latest_metrics.pbv,
            "dividend_yield": latest_metrics.dividend_yield,
            "eps": latest_metrics.eps,
            "roe": latest_metrics.roe,
            "observation_date": latest_metrics.observation_date.isoformat()
        }
    else:
        response["key_metrics"] = None

    return response


@router.get("/{symbol}/chart")
def get_ticker_chart(
    symbol: str,
    range: str = Query("1Y", description="Preset range: 1M, 3M, 6M, 1Y, 5Y, ALL"),
    ma_periods: str = Query("20,50,200", description="Comma-separated MA periods"),
    db: Session = Depends(get_db)
):
    """
    Get chart data for ticker.

    Returns unified time-series data for Price + Technical Indicators.
    """
    from datetime import date, timedelta

    ticker = db.query(Ticker).filter(Ticker.symbol == symbol.upper()).first()
    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker not found")

    # Map range to days
    range_map = {
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365,
        "5Y": 1825,
        "ALL": 3650  # 10 years
    }
    days = range_map.get(range.upper(), 365)
    start_date = date.today() - timedelta(days=days)

    # Get price data
    prices = db.query(DailyPrice).filter(
        and_(
            DailyPrice.ticker_id == ticker.id,
            DailyPrice.date >= start_date
        )
    ).order_by(DailyPrice.date.asc()).all()

    if not prices:
        raise HTTPException(status_code=404, detail="No price data available for this ticker")

    # Parse MA periods
    ma_periods_list = [int(p.strip()) for p in ma_periods.split(",") if p.strip().isdigit()]

    # Get all indicators for the date range
    indicator_data = db.query(TechnicalIndicator).filter(
        and_(
            TechnicalIndicator.ticker_id == ticker.id,
            TechnicalIndicator.date >= start_date
        )
    ).order_by(TechnicalIndicator.date.asc()).all()

    # Group indicators by date
    indicators_by_date = {}
    for ind in indicator_data:
        if ind.date not in indicators_by_date:
            indicators_by_date[ind.date] = {}
        if ind.indicator_type == "sma":
            indicators_by_date[ind.date][f"ma_{ind.window_period}"] = ind.value
        elif ind.indicator_type == "rsi":
            indicators_by_date[ind.date]["rsi_14"] = ind.value
        elif ind.indicator_type == "macd":
            # Current storage format: one MACD row with signal/histogram in extra_data JSON.
            macd_data = {
                "value": float(ind.value),
                "signal": None,
                "histogram": None,
            }

            if ind.extra_data:
                try:
                    extra_data = json.loads(ind.extra_data)
                    if isinstance(extra_data, dict):
                        if extra_data.get("signal") is not None:
                            macd_data["signal"] = float(extra_data["signal"])
                        if extra_data.get("histogram") is not None:
                            macd_data["histogram"] = float(extra_data["histogram"])
                except (TypeError, ValueError):
                    pass

            indicators_by_date[ind.date]["macd"] = macd_data

    # Build chart data
    chart_data = {
        "symbol": ticker.symbol,
        "range": range,
        "data": []
    }

    for p in prices:
        date_str = p.date.isoformat()
        data_point = {
            "date": date_str,
            "price": {
                "open": float(p.open) if p.open else None,
                "high": float(p.high) if p.high else None,
                "low": float(p.low) if p.low else None,
                "close": float(p.close),
                "volume": int(p.volume) if p.volume else None
            },
            "indicators": indicators_by_date.get(p.date, {})
        }
        chart_data["data"].append(data_point)

    return chart_data