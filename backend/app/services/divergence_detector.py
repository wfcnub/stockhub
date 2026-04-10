from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import DailyPrice, TechnicalIndicator, Ticker

# Default configuration values
DEFAULT_PIVOT_LEFT_WINDOW = 5
DEFAULT_CONFIRMED_RIGHT_MIN = 2
DEFAULT_CONFIRMED_RIGHT_MAX = 5
DEFAULT_AGGRESSIVE_RIGHT_MIN = 0
DEFAULT_AGGRESSIVE_RIGHT_MAX = 1
MAX_LOOKBACK_BARS = 60
RSI_WINDOW_PERIOD = 14
SCREENER_RECENT_BARS = 220
STRATEGY_CONFIRMED = "BULLISH_CONFIRMED"
STRATEGY_AGGRESSIVE = "BULLISH_AGGRESSIVE"
AGGRESSIVE_COLOR_HEX = "#FFBF00"
ACTION_HINT_AGGRESSIVE = "Potential Bottom - Monitor for Open Entry."


@dataclass(frozen=True)
class DivergenceConfig:
    pivot_left_window: int = DEFAULT_PIVOT_LEFT_WINDOW
    confirmed_right_min: int = DEFAULT_CONFIRMED_RIGHT_MIN
    confirmed_right_max: int = DEFAULT_CONFIRMED_RIGHT_MAX
    aggressive_right_min: int = DEFAULT_AGGRESSIVE_RIGHT_MIN
    aggressive_right_max: int = DEFAULT_AGGRESSIVE_RIGHT_MAX


@dataclass(frozen=True)
class PriceRsiPoint:
    date: date
    low: float
    rsi: float


class DivergenceDetectorService:
    """Detects regular and hidden bullish divergences from price lows and RSI(14)."""

    def __init__(self, db: Session, config: Optional[DivergenceConfig] = None):
        self.db = db
        self.config = config or DivergenceConfig()

    @staticmethod
    def _to_unix_seconds(value: date) -> int:
        return int(datetime.combine(value, time.min, tzinfo=timezone.utc).timestamp())

    @staticmethod
    def _strategy_priority(strategy_type: str) -> int:
        return 0 if strategy_type == STRATEGY_AGGRESSIVE else 1

    def _fetch_joined_price_rsi(
        self,
        ticker_id: int,
        limit_bars: Optional[int] = None,
    ) -> List[PriceRsiPoint]:
        query = self.db.query(
            DailyPrice.date.label("date"),
            DailyPrice.low.label("low"),
            TechnicalIndicator.value.label("rsi"),
        ).join(
            TechnicalIndicator,
            and_(
                TechnicalIndicator.ticker_id == DailyPrice.ticker_id,
                TechnicalIndicator.date == DailyPrice.date,
                TechnicalIndicator.indicator_type == "rsi",
                TechnicalIndicator.window_period == RSI_WINDOW_PERIOD,
            ),
        ).filter(
            DailyPrice.ticker_id == ticker_id,
            DailyPrice.low.isnot(None),
        )

        if limit_bars:
            rows = query.order_by(DailyPrice.date.desc()).limit(limit_bars).all()
            rows = list(reversed(rows))
        else:
            rows = query.order_by(DailyPrice.date.asc()).all()

        points: List[PriceRsiPoint] = []
        for row in rows:
            if row.low is None or row.rsi is None:
                continue
            points.append(PriceRsiPoint(date=row.date, low=float(row.low), rsi=float(row.rsi)))

        return points

    def _find_pivot_candidates(
        self,
        points: List[PriceRsiPoint],
    ) -> List[Tuple[int, int]]:
        if len(points) < (self.config.pivot_left_window + 1):
            return []

        pivot_candidates: List[Tuple[int, int]] = []
        left_window = self.config.pivot_left_window
        lows = [point.low for point in points]

        for idx in range(left_window, len(points)):
            candidate = lows[idx]
            left_values = lows[idx - left_window:idx]
            if not all(candidate < value for value in left_values):
                continue

            right_count = 0
            for j in range(idx + 1, len(points)):
                if lows[j] > candidate:
                    right_count += 1
                else:
                    break

            pivot_candidates.append((idx, right_count))

        return pivot_candidates

    def _classify_pivots(
        self,
        pivot_candidates: List[Tuple[int, int]],
    ) -> Tuple[List[int], List[Tuple[int, int]], List[Tuple[int, int]]]:
        historical_pivots: List[int] = []
        aggressive_pivots: List[Tuple[int, int]] = []
        confirmed_pivots: List[Tuple[int, int]] = []

        left_window = self.config.pivot_left_window
        confirmed_min = self.config.confirmed_right_min
        confirmed_max = self.config.confirmed_right_max
        aggressive_min = self.config.aggressive_right_min
        aggressive_max = self.config.aggressive_right_max

        for idx, right_count in pivot_candidates:
            if right_count >= left_window:
                historical_pivots.append(idx)
            elif aggressive_min <= right_count <= aggressive_max:
                aggressive_pivots.append((idx, right_count))
            elif confirmed_min <= right_count <= confirmed_max:
                confirmed_pivots.append((idx, right_count))

        return historical_pivots, aggressive_pivots, confirmed_pivots

    def _build_confirmed_event(
        self,
        points: List[PriceRsiPoint],
        p1_index: int,
        p2_index: int,
        divergence_type: str,
        confirmation_degree: int,
    ) -> Dict[str, object]:
        p1 = points[p1_index]
        p2 = points[p2_index]

        grade = "oversold" if (p1.rsi <= 30 or p2.rsi <= 30) else "neutral"
        color_hex = "#22C55E" if divergence_type == "regular" else "#14B8A6"

        return {
            "strategy_type": STRATEGY_CONFIRMED,
            "type": divergence_type,
            "logic_type": divergence_type,
            "line_style": "dashed",
            "color_hex": color_hex,
            "grade": grade,
            "confirmation_degree": confirmation_degree,
            "p1": {
                "timestamp": self._to_unix_seconds(p1.date),
                "low": p1.low,
                "rsi_14": p1.rsi,
            },
            "p2": {
                "timestamp": self._to_unix_seconds(p2.date),
                "low": p2.low,
                "rsi_14": p2.rsi,
            },
            "trough_timestamp": self._to_unix_seconds(p2.date),
            "confirmation_timestamp": self._to_unix_seconds(p2.date),
            "signal_timestamp": self._to_unix_seconds(p2.date),
            "invalidation_level": None,
            "action": "Confirmed divergence setup",
        }

    def _build_aggressive_event(
        self,
        points: List[PriceRsiPoint],
        p1_index: int,
        p2_index: int,
        divergence_type: str,
        confirmation_degree: int,
    ) -> Dict[str, object]:
        p1 = points[p1_index]
        p2 = points[p2_index]
        signal_timestamp = self._to_unix_seconds(p2.date)
        grade = "oversold" if p2.rsi <= 30 else "neutral"

        return {
            "strategy_type": STRATEGY_AGGRESSIVE,
            "type": divergence_type,
            "logic_type": divergence_type,
            "line_style": "dotted",
            "color_hex": AGGRESSIVE_COLOR_HEX,
            "grade": grade,
            "confirmation_degree": confirmation_degree,
            "p1": {
                "timestamp": self._to_unix_seconds(p1.date),
                "low": p1.low,
                "rsi_14": p1.rsi,
            },
            "p2": {
                "timestamp": signal_timestamp,
                "low": p2.low,
                "rsi_14": p2.rsi,
            },
            "trough_timestamp": signal_timestamp,
            "confirmation_timestamp": signal_timestamp,
            "signal_timestamp": signal_timestamp,
            "invalidation_level": p2.low,
            "action": ACTION_HINT_AGGRESSIVE,
        }

    def _detect_divergence_events(
        self,
        points: List[PriceRsiPoint],
        historical_pivots: List[int],
        recent_pivots: List[Tuple[int, int]],
        is_aggressive: bool,
    ) -> List[Dict[str, object]]:
        events: List[Dict[str, object]] = []

        for p2_index, right_count in recent_pivots:
            p2 = points[p2_index]

            for p1_index in historical_pivots:
                if p1_index >= p2_index:
                    continue
                if p2_index - p1_index > MAX_LOOKBACK_BARS:
                    continue

                p1 = points[p1_index]
                divergence_type: Optional[str] = None

                if p2.low < p1.low and p2.rsi > p1.rsi:
                    divergence_type = "regular"
                elif p2.low > p1.low and p2.rsi < p1.rsi:
                    divergence_type = "hidden"

                if divergence_type is None:
                    continue

                if is_aggressive:
                    event = self._build_aggressive_event(
                        points, p1_index, p2_index, divergence_type, right_count
                    )
                else:
                    event = self._build_confirmed_event(
                        points, p1_index, p2_index, divergence_type, right_count
                    )
                events.append(event)

        return events

    def detect_for_ticker(
        self,
        ticker_id: int,
        limit_bars: Optional[int] = None,
    ) -> List[Dict[str, object]]:
        points = self._fetch_joined_price_rsi(ticker_id=ticker_id, limit_bars=limit_bars)
        if not points:
            return []

        pivot_candidates = self._find_pivot_candidates(points)
        historical_pivots, aggressive_pivots, confirmed_pivots = self._classify_pivots(pivot_candidates)

        events: List[Dict[str, object]] = []

        confirmed_events = self._detect_divergence_events(
            points, historical_pivots, confirmed_pivots, is_aggressive=False
        )
        events.extend(confirmed_events)

        aggressive_events = self._detect_divergence_events(
            points, historical_pivots, aggressive_pivots, is_aggressive=True
        )
        events.extend(aggressive_events)

        events.sort(
            key=lambda event: (
                int(event["signal_timestamp"]),
                self._strategy_priority(str(event["strategy_type"])),
            )
        )
        return events

    def detect_recent_market_divergences(self, days: int = 7) -> List[Dict[str, object]]:
        cutoff_timestamp = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
        tickers = (
            self.db.query(Ticker.id, Ticker.symbol, Ticker.name)
            .filter(Ticker.is_active)
            .all()
        )

        results: List[Dict[str, object]] = []

        for ticker in tickers:
            ticker_events = self.detect_for_ticker(
                ticker_id=ticker.id,
                limit_bars=SCREENER_RECENT_BARS,
            )
            for event in ticker_events:
                signal_timestamp = int(event["signal_timestamp"])
                if signal_timestamp < cutoff_timestamp:
                    continue

                results.append(
                    {
                        "symbol": ticker.symbol,
                        "name": ticker.name,
                        **event,
                    }
                )

        results.sort(
            key=lambda event: (
                -int(event["signal_timestamp"]),
                self._strategy_priority(str(event["strategy_type"])),
            )
        )
        return results