from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models import Ticker
from app.services.divergence_detector import DivergenceDetectorService, DivergenceConfig

router = APIRouter(tags=["divergences"])


def _build_divergence_config(
    pivot_left_window: int,
    confirmed_right_min: int,
    confirmed_right_max: int,
    aggressive_right_min: int,
    aggressive_right_max: int,
) -> DivergenceConfig:
    if confirmed_right_min > confirmed_right_max:
        raise HTTPException(
            status_code=400,
            detail="confirmed_right_min cannot be greater than confirmed_right_max",
        )
    if aggressive_right_min > aggressive_right_max:
        raise HTTPException(
            status_code=400,
            detail="aggressive_right_min cannot be greater than aggressive_right_max",
        )
    if confirmed_right_min <= aggressive_right_max:
        raise HTTPException(
            status_code=400,
            detail="confirmed_right_min must be greater than aggressive_right_max (no overlap)",
        )

    return DivergenceConfig(
        pivot_left_window=pivot_left_window,
        confirmed_right_min=confirmed_right_min,
        confirmed_right_max=confirmed_right_max,
        aggressive_right_min=aggressive_right_min,
        aggressive_right_max=aggressive_right_max,
    )


@router.get("/charts/{ticker_symbol}/divergences")
def get_ticker_divergences(
    ticker_symbol: str,
    pivot_left_window: int = Query(
        5,
        ge=1,
        le=20,
        description="Number of bars to the left of a pivot that must be higher",
    ),
    confirmed_right_min: int = Query(
        2,
        ge=0,
        le=10,
        description="Minimum right bars for a pivot to be confirmed",
    ),
    confirmed_right_max: int = Query(
        5,
        ge=0,
        le=10,
        description="Maximum right bars for a confirmed pivot",
    ),
    aggressive_right_min: int = Query(
        0,
        ge=0,
        le=10,
        description="Minimum right bars for an aggressive pivot",
    ),
    aggressive_right_max: int = Query(
        1,
        ge=0,
        le=10,
        description="Maximum right bars for an aggressive pivot",
    ),
    db: Session = Depends(get_db),
):
    ticker = db.query(Ticker).filter(
        Ticker.symbol == ticker_symbol.upper(),
        Ticker.is_active,
    ).first()

    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker not found")

    config = _build_divergence_config(
        pivot_left_window,
        confirmed_right_min,
        confirmed_right_max,
        aggressive_right_min,
        aggressive_right_max,
    )

    detector = DivergenceDetectorService(db, config=config)
    events = detector.detect_for_ticker(ticker.id)

    return {
        "symbol": ticker.symbol,
        "events": events,
    }


@router.get("/screener/divergences")
def get_divergence_screener(
    days: int = Query(
        7,
        ge=1,
        le=30,
        description="Return divergence signals within the last N days",
    ),
    limit: int = Query(
        500,
        ge=1,
        le=5000,
        description="Maximum number of rows returned",
    ),
    pivot_left_window: int = Query(
        5,
        ge=1,
        le=20,
        description="Number of bars to the left of a pivot that must be higher",
    ),
    confirmed_right_min: int = Query(
        2,
        ge=0,
        le=10,
        description="Minimum right bars for a pivot to be confirmed",
    ),
    confirmed_right_max: int = Query(
        5,
        ge=0,
        le=10,
        description="Maximum right bars for a confirmed pivot",
    ),
    aggressive_right_min: int = Query(
        0,
        ge=0,
        le=10,
        description="Minimum right bars for an aggressive pivot",
    ),
    aggressive_right_max: int = Query(
        1,
        ge=0,
        le=10,
        description="Maximum right bars for an aggressive pivot",
    ),
    db: Session = Depends(get_db),
):
    config = _build_divergence_config(
        pivot_left_window,
        confirmed_right_min,
        confirmed_right_max,
        aggressive_right_min,
        aggressive_right_max,
    )

    detector = DivergenceDetectorService(db, config=config)
    results = detector.detect_recent_market_divergences(days=days)

    if limit:
        results = results[:limit]

    return {
        "lookback_days": days,
        "count": len(results),
        "results": results,
    }