from __future__ import annotations

from typing import Dict, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models import Index, Ticker
from app.services.triangle_detector import (
    BREAKOUT_DIRECTION_BEARISH,
    BREAKOUT_DIRECTION_BULLISH,
    TRIANGLE_STATE_BREAKOUT,
    TRIANGLE_STATE_POTENTIAL,
    TRIANGLE_TYPES,
    TriangleConfig,
    TriangleDetectorService,
)

router = APIRouter(tags=["triangles"])

VALID_DIRECTIONS = {"all", BREAKOUT_DIRECTION_BULLISH, BREAKOUT_DIRECTION_BEARISH}
VALID_STATES = {"all", TRIANGLE_STATE_POTENTIAL, TRIANGLE_STATE_BREAKOUT}


def _parse_triangle_types_csv(triangle_types: str) -> Set[str]:
    raw_values = [value.strip().lower() for value in triangle_types.split(",")]
    parsed_values = {value for value in raw_values if value}

    if not parsed_values:
        raise HTTPException(
            status_code=400,
            detail="triangle_types must include at least one valid type",
        )

    invalid_values = sorted(value for value in parsed_values if value not in TRIANGLE_TYPES)
    if invalid_values:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid triangle_types value(s): "
                + ", ".join(invalid_values)
                + ". Allowed values: symmetrical, ascending, descending"
            ),
        )

    return parsed_values


def _validate_direction(direction: str) -> str:
    normalized = direction.strip().lower()
    if normalized not in VALID_DIRECTIONS:
        raise HTTPException(
            status_code=400,
            detail="direction must be one of: all, bullish, bearish",
        )
    return normalized


def _validate_state(state: str) -> str:
    normalized = state.strip().lower()
    if normalized not in VALID_STATES:
        raise HTTPException(
            status_code=400,
            detail="state must be one of: all, potential, breakout",
        )
    return normalized


def _build_triangle_config(
    lookback_bars: int,
    pivot_left_window: int,
    pivot_right_window: int,
    breakout_relaxed: bool,
) -> TriangleConfig:
    return TriangleConfig(
        lookback_bars=lookback_bars,
        pivot_left_window=pivot_left_window,
        pivot_right_window=pivot_right_window,
        breakout_relaxed=breakout_relaxed,
    )


def _event_matches(
    event: Dict[str, object],
    allowed_triangle_types: Set[str],
    min_confidence: int,
    direction: str,
    state: Optional[str] = None,
    include_potential: bool = True,
    include_breakouts: bool = True,
) -> bool:
    event_triangle_type = str(event.get("triangle_type", "")).lower()
    if event_triangle_type not in allowed_triangle_types:
        return False

    event_state = str(event.get("state", "")).lower()
    if event_state == TRIANGLE_STATE_POTENTIAL and not include_potential:
        return False
    if event_state == TRIANGLE_STATE_BREAKOUT and not include_breakouts:
        return False

    if state and state != "all" and event_state != state:
        return False

    if direction != "all":
        if event_state != TRIANGLE_STATE_BREAKOUT:
            return False

        event_direction = str(event.get("breakout_direction") or "").lower()
        if event_direction != direction:
            return False

    confidence_score = int(event.get("confidence_score", 0))
    if confidence_score < min_confidence:
        return False

    return True


@router.get("/charts/{ticker_symbol}/triangles")
def get_ticker_triangles(
    ticker_symbol: str,
    lookback_bars: int = Query(
        60,
        ge=30,
        le=180,
        description="Historical bars used for triangle detection",
    ),
    pivot_left_window: int = Query(
        3,
        ge=1,
        le=10,
        description="Pivot-left bars for local highs/lows",
    ),
    pivot_right_window: int = Query(
        1,
        ge=0,
        le=10,
        description="Pivot-right bars for local highs/lows",
    ),
    include_potential: bool = Query(
        True,
        description="Include potential triangle events",
    ),
    include_breakouts: bool = Query(
        True,
        description="Include breakout triangle events",
    ),
    triangle_types: str = Query(
        "symmetrical,ascending,descending",
        description="CSV filter: symmetrical,ascending,descending",
    ),
    direction: str = Query(
        "all",
        description="Breakout direction filter: all,bullish,bearish",
    ),
    min_confidence: int = Query(
        0,
        ge=0,
        le=100,
        description="Minimum confidence score (0-100)",
    ),
    breakout_relaxed: bool = Query(
        False,
        description="If true, uses a lower breakout buffer to increase breakout sensitivity",
    ),
    db: Session = Depends(get_db),
):
    ticker = (
        db.query(Ticker)
        .filter(Ticker.symbol == ticker_symbol.upper(), Ticker.is_active)
        .first()
    )

    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker not found")

    if not include_potential and not include_breakouts:
        return {"symbol": ticker.symbol, "events": []}

    allowed_triangle_types = _parse_triangle_types_csv(triangle_types)
    normalized_direction = _validate_direction(direction)
    config = _build_triangle_config(
        lookback_bars,
        pivot_left_window,
        pivot_right_window,
        breakout_relaxed,
    )

    detector = TriangleDetectorService(db, config=config)
    events = detector.detect_for_ticker(ticker.id)

    filtered_events = [
        event
        for event in events
        if _event_matches(
            event=event,
            allowed_triangle_types=allowed_triangle_types,
            min_confidence=min_confidence,
            direction=normalized_direction,
            include_potential=include_potential,
            include_breakouts=include_breakouts,
        )
    ]

    return {
        "symbol": ticker.symbol,
        "events": filtered_events,
    }


@router.get("/screener/triangles")
def get_triangle_screener(
    days: int = Query(
        7,
        ge=1,
        le=30,
        description="Return triangle signals within the last N days",
    ),
    limit: int = Query(
        500,
        ge=1,
        le=5000,
        description="Maximum number of rows returned",
    ),
    index_code: Optional[str] = Query(
        None,
        description="Optional index code scope for screening universe",
    ),
    state: str = Query(
        "all",
        description="State filter: all,potential,breakout",
    ),
    direction: str = Query(
        "all",
        description="Breakout direction filter: all,bullish,bearish",
    ),
    triangle_types: str = Query(
        "symmetrical,ascending,descending",
        description="CSV filter: symmetrical,ascending,descending",
    ),
    min_confidence: int = Query(
        0,
        ge=0,
        le=100,
        description="Minimum confidence score (0-100)",
    ),
    lookback_bars: int = Query(
        60,
        ge=30,
        le=180,
        description="Historical bars used for triangle detection",
    ),
    pivot_left_window: int = Query(
        3,
        ge=1,
        le=10,
        description="Pivot-left bars for local highs/lows",
    ),
    pivot_right_window: int = Query(
        1,
        ge=0,
        le=10,
        description="Pivot-right bars for local highs/lows",
    ),
    breakout_relaxed: bool = Query(
        False,
        description="If true, uses a lower breakout buffer to increase breakout sensitivity",
    ),
    db: Session = Depends(get_db),
):
    allowed_triangle_types = _parse_triangle_types_csv(triangle_types)
    normalized_direction = _validate_direction(direction)
    normalized_state = _validate_state(state)
    config = _build_triangle_config(
        lookback_bars,
        pivot_left_window,
        pivot_right_window,
        breakout_relaxed,
    )

    scoped_index_id: Optional[int] = None
    if index_code:
        normalized_index_code = index_code.strip().upper()
        index_record = (
            db.query(Index)
            .filter(Index.code == normalized_index_code, Index.is_active)
            .first()
        )
        if not index_record:
            raise HTTPException(status_code=404, detail="Index not found")
        scoped_index_id = index_record.id

    detector = TriangleDetectorService(db, config=config)
    results = detector.detect_recent_market_triangles(days=days, index_id=scoped_index_id)

    filtered_results = [
        event
        for event in results
        if _event_matches(
            event=event,
            allowed_triangle_types=allowed_triangle_types,
            min_confidence=min_confidence,
            direction=normalized_direction,
            state=normalized_state,
        )
    ]

    if limit:
        filtered_results = filtered_results[:limit]

    return {
        "lookback_days": days,
        "count": len(filtered_results),
        "results": filtered_results,
    }
