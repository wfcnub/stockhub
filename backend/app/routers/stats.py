from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.db.database import get_db
from app.models import Index, Ticker, DailyPrice, KeyMetric

router = APIRouter(tags=["stats"])


@router.get("/stats")
def get_platform_stats(db: Session = Depends(get_db)):
    """
    Get platform statistics for the Hero section.

    Returns aggregate data for the Landing Page Hero section.
    """
    # Count total active tickers
    total_tickers = db.query(Ticker).filter(Ticker.is_active == True).count()

    # Count total indexes
    total_indexes = db.query(Index).filter(Index.is_active == True).count()

    # Get last global sync (most recent last_synced_at from indexes)
    last_sync_index = db.query(Index).filter(
        Index.is_active == True,
        Index.last_synced_at.isnot(None)
    ).order_by(Index.last_synced_at.desc()).first()

    last_global_sync = last_sync_index.last_synced_at.isoformat() if last_sync_index else None

    # Get all indexes with details
    indexes = db.query(Index).filter(Index.is_active == True).all()

    return {
        "total_tickers": total_tickers,
        "total_indexes": total_indexes,
        "last_global_sync": last_global_sync,
        "indexes": [
            {
                "code": idx.code,
                "name": idx.name,
                "yfinance_suffix": idx.yfinance_suffix or "",
                "ticker_count": idx.ticker_count,
                "last_sync": idx.last_synced_at.isoformat() if idx.last_synced_at else None
            }
            for idx in indexes
        ]
    }


@router.get("/screener")
def stock_screener(
    preset: str = Query(None, description="Preset name: bullish_divergence"),
    min_price: float = Query(None, description="Minimum latest price"),
    max_price: float = Query(None, description="Maximum latest price"),
    min_volume: int = Query(None, description="Minimum average volume"),
    sector: str = Query(None, description="Filter by sector"),
    min_pe: float = Query(None, description="Minimum P/E ratio"),
    max_pe: float = Query(None, description="Maximum P/E ratio"),
    min_market_cap: float = Query(None, description="Minimum market cap"),
    max_market_cap: float = Query(None, description="Maximum market cap"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    Stock screener with technical presets and fundamental/price filters.

    Returns tickers matching the criteria.
    """
    # If preset is specified, use preset filters
    if preset == "bullish_divergence":
        # TODO: Implement bullish divergence detection
        # For now, return empty results
        return {
            "preset": "bullish_divergence",
            "results": []
        }

    # Custom filters
    # Subquery for latest price per ticker
    latest_price_subq = db.query(
        DailyPrice.ticker_id,
        func.max(DailyPrice.date).label("max_date")
    ).group_by(DailyPrice.ticker_id).subquery()

    # Join with prices to get latest prices
    query = db.query(Ticker).join(
        latest_price_subq,
        Ticker.id == latest_price_subq.c.ticker_id
    ).join(
        DailyPrice,
        and_(
            DailyPrice.ticker_id == latest_price_subq.c.ticker_id,
            DailyPrice.date == latest_price_subq.c.max_date
        )
    ).filter(Ticker.is_active == True)

    # Apply price filters
    if min_price is not None:
        query = query.filter(DailyPrice.close >= min_price)
    if max_price is not None:
        query = query.filter(DailyPrice.close <= max_price)

    # Apply sector filter
    if sector:
        query = query.filter(Ticker.sector.ilike(f"%{sector}%"))

    # Apply volume filter
    if min_volume is not None:
        query = query.filter(DailyPrice.volume >= min_volume)

    # Apply P/E filter if specified
    if min_pe is not None or max_pe is not None:
        # Subquery for latest key metrics
        latest_metrics_subq = db.query(
            KeyMetric.ticker_id,
            func.max(KeyMetric.observation_date).label("max_date")
        ).group_by(KeyMetric.ticker_id).subquery()

        metrics_join = db.query(KeyMetric).join(
            latest_metrics_subq,
            and_(
                KeyMetric.ticker_id == latest_metrics_subq.c.ticker_id,
                KeyMetric.observation_date == latest_metrics_subq.c.max_date
            )
        ).subquery()

        query = query.join(metrics_join, Ticker.id == metrics_join.c.ticker_id)

        if min_pe is not None:
            query = query.filter(metrics_join.c.pe_ratio >= min_pe)
        if max_pe is not None:
            query = query.filter(metrics_join.c.pe_ratio <= max_pe)
        if min_market_cap is not None:
            query = query.filter(metrics_join.c.market_cap >= min_market_cap)
        if max_market_cap is not None:
            query = query.filter(metrics_join.c.market_cap <= max_market_cap)

    # Get total count
    total = query.count()

    # Apply limit
    results = query.limit(limit).all()

    return {
        "total": total,
        "results": [
            {
                "symbol": t.symbol,
                "name": t.name,
                "sector": t.sector,
                "latest_close": t.prices[0].close if t.prices else None,
                "latest_volume": t.prices[0].volume if t.prices else None
            }
            for t in results
        ]
    }