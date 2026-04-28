from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Sequence

import numpy as np
from sqlalchemy.orm import Session

from app.models import DailyPrice, Ticker

DEFAULT_LOOKBACK_BARS = 60
DEFAULT_PIVOT_LEFT_WINDOW = 3
DEFAULT_PIVOT_RIGHT_WINDOW = 1
DEFAULT_VOLUME_AVG_WINDOW = 20
DEFAULT_BREAKOUT_BUFFER_PCT = 0.10
DEFAULT_RELAXED_BREAKOUT_BUFFER_MULTIPLIER = 0.5
DEFAULT_INSIDE_BUFFER_PCT = 0.05
DEFAULT_FORMATION_EXCLUDE_LATEST_BARS = 1
DEFAULT_RELAXED_EXTRA_EXCLUDE_BARS = 1
DEFAULT_MAX_APEX_EXTENSION_RATIO = 0.5
DEFAULT_MIN_TOUCHES_UPPER = 2
DEFAULT_MIN_TOUCHES_LOWER = 2
DEFAULT_TOUCH_TOLERANCE_PCT = 0.15
DEFAULT_BOUNDARY_EARLY_TOLERANCE_PCT = 0.60
DEFAULT_BOUNDARY_LATE_TOLERANCE_PCT = 0.08
DEFAULT_BOUNDARY_TIGHTEN_START_RATIO = 0.70

DEFAULT_FLAT_EPS_PCT = 0.02
DEFAULT_TREND_MIN_PCT = 0.02

TRIANGLE_TYPE_SYMMETRICAL = "symmetrical"
TRIANGLE_TYPE_ASCENDING = "ascending"
TRIANGLE_TYPE_DESCENDING = "descending"

TRIANGLE_STATE_POTENTIAL = "potential"
TRIANGLE_STATE_BREAKOUT = "breakout"

BREAKOUT_DIRECTION_BULLISH = "bullish"
BREAKOUT_DIRECTION_BEARISH = "bearish"

TRIANGLE_TYPES = {
    TRIANGLE_TYPE_SYMMETRICAL,
    TRIANGLE_TYPE_ASCENDING,
    TRIANGLE_TYPE_DESCENDING,
}


@dataclass(frozen=True)
class TriangleConfig:
    lookback_bars: int = DEFAULT_LOOKBACK_BARS
    pivot_left_window: int = DEFAULT_PIVOT_LEFT_WINDOW
    pivot_right_window: int = DEFAULT_PIVOT_RIGHT_WINDOW
    volume_avg_window: int = DEFAULT_VOLUME_AVG_WINDOW
    breakout_buffer_pct: float = DEFAULT_BREAKOUT_BUFFER_PCT
    breakout_relaxed: bool = False
    relaxed_breakout_buffer_multiplier: float = DEFAULT_RELAXED_BREAKOUT_BUFFER_MULTIPLIER
    formation_exclude_latest_bars: int = DEFAULT_FORMATION_EXCLUDE_LATEST_BARS
    relaxed_extra_exclude_bars: int = DEFAULT_RELAXED_EXTRA_EXCLUDE_BARS
    inside_buffer_pct: float = DEFAULT_INSIDE_BUFFER_PCT
    max_apex_extension_ratio: float = DEFAULT_MAX_APEX_EXTENSION_RATIO
    min_touches_upper: int = DEFAULT_MIN_TOUCHES_UPPER
    min_touches_lower: int = DEFAULT_MIN_TOUCHES_LOWER
    touch_tolerance_pct: float = DEFAULT_TOUCH_TOLERANCE_PCT
    boundary_early_tolerance_pct: float = DEFAULT_BOUNDARY_EARLY_TOLERANCE_PCT
    boundary_late_tolerance_pct: float = DEFAULT_BOUNDARY_LATE_TOLERANCE_PCT
    boundary_tighten_start_ratio: float = DEFAULT_BOUNDARY_TIGHTEN_START_RATIO
    flat_eps_pct: float = DEFAULT_FLAT_EPS_PCT
    trend_min_pct: float = DEFAULT_TREND_MIN_PCT
    prefer_converging_lines: bool = True


@dataclass(frozen=True)
class PriceBar:
    date: date
    high: float
    low: float
    close: float
    volume: Optional[float]


@dataclass(frozen=True)
class FittedLine:
    slope: float
    intercept: float
    touch_count: int
    start_timestamp: int
    start_price: float
    end_timestamp: int
    end_price: float

    def y(self, index: float) -> float:
        return (self.slope * index) + self.intercept


@dataclass(frozen=True)
class TriangleEvent:
    triangle_type: str
    state: str
    breakout_direction: Optional[str]
    line_style: str
    color_hex: str
    confidence_level: str
    confidence_score: int
    upper_touch_count: int
    lower_touch_count: int
    total_touch_count: int
    breakout_close_count: int
    volume_ratio: Optional[float]
    upper_line: Dict[str, float | int]
    lower_line: Dict[str, float | int]
    formation_start_timestamp: int
    apex_timestamp: int
    signal_timestamp: int
    invalidation_level: Optional[float]
    action: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "triangle_type": self.triangle_type,
            "state": self.state,
            "breakout_direction": self.breakout_direction,
            "line_style": self.line_style,
            "color_hex": self.color_hex,
            "confidence_level": self.confidence_level,
            "confidence_score": self.confidence_score,
            "upper_touch_count": self.upper_touch_count,
            "lower_touch_count": self.lower_touch_count,
            "total_touch_count": self.total_touch_count,
            "breakout_close_count": self.breakout_close_count,
            "volume_ratio": self.volume_ratio,
            "upper_line": self.upper_line,
            "lower_line": self.lower_line,
            "formation_start_timestamp": self.formation_start_timestamp,
            "apex_timestamp": self.apex_timestamp,
            "signal_timestamp": self.signal_timestamp,
            "invalidation_level": self.invalidation_level,
            "action": self.action,
        }


class TriangleDetectorService:
    """Detects potential and breakout triangle patterns from OHLCV price history."""

    def __init__(self, db: Session, config: Optional[TriangleConfig] = None):
        self.db = db
        self.config = config or TriangleConfig()

    @staticmethod
    def _to_unix_seconds(value: date) -> int:
        return int(datetime.combine(value, time.min, tzinfo=timezone.utc).timestamp())

    @staticmethod
    def _state_priority(state: str) -> int:
        return 0 if state == TRIANGLE_STATE_BREAKOUT else 1

    def _effective_breakout_buffer_ratio(self) -> float:
        multiplier = (
            self.config.relaxed_breakout_buffer_multiplier
            if self.config.breakout_relaxed
            else 1.0
        )
        effective_pct = max(0.0, self.config.breakout_buffer_pct * max(0.0, multiplier))
        return effective_pct / 100.0

    def _formation_validation_end_index(self, bars_length: int) -> int:
        if bars_length <= 0:
            return 0

        excluded = max(0, self.config.formation_exclude_latest_bars)
        if self.config.breakout_relaxed:
            excluded += max(0, self.config.relaxed_extra_exclude_bars)

        # Keep at least one bar for formation validation.
        return max(1, bars_length - excluded)

    def _fetch_prices(self, ticker_id: int) -> List[PriceBar]:
        rows = (
            self.db.query(
                DailyPrice.date.label("date"),
                DailyPrice.high.label("high"),
                DailyPrice.low.label("low"),
                DailyPrice.close.label("close"),
                DailyPrice.volume.label("volume"),
            )
            .filter(DailyPrice.ticker_id == ticker_id)
            .order_by(DailyPrice.date.desc())
            .limit(self.config.lookback_bars)
            .all()
        )

        bars: List[PriceBar] = []
        for row in reversed(rows):
            if row.high is None or row.low is None or row.close is None:
                continue

            bars.append(
                PriceBar(
                    date=row.date,
                    high=float(row.high),
                    low=float(row.low),
                    close=float(row.close),
                    volume=float(row.volume) if row.volume is not None else None,
                )
            )

        return bars

    def _find_pivot_highs(self, bars: Sequence[PriceBar]) -> List[int]:
        left = self.config.pivot_left_window
        right = self.config.pivot_right_window

        if len(bars) < (left + right + 1):
            return []

        highs = [bar.high for bar in bars]
        pivots: List[int] = []

        for idx in range(left, len(bars) - right):
            candidate = highs[idx]
            left_values = highs[idx - left:idx]
            right_values = highs[idx + 1:idx + right + 1] if right > 0 else []

            if all(candidate > value for value in left_values) and all(
                candidate > value for value in right_values
            ):
                pivots.append(idx)

        return pivots

    def _find_pivot_lows(self, bars: Sequence[PriceBar]) -> List[int]:
        left = self.config.pivot_left_window
        right = self.config.pivot_right_window

        if len(bars) < (left + right + 1):
            return []

        lows = [bar.low for bar in bars]
        pivots: List[int] = []

        for idx in range(left, len(bars) - right):
            candidate = lows[idx]
            left_values = lows[idx - left:idx]
            right_values = lows[idx + 1:idx + right + 1] if right > 0 else []

            if all(candidate < value for value in left_values) and all(
                candidate < value for value in right_values
            ):
                pivots.append(idx)

        return pivots

    def _fit_line(
        self,
        bars: Sequence[PriceBar],
        pivot_indexes: Sequence[int],
        use_highs: bool,
    ) -> Optional[FittedLine]:
        if len(pivot_indexes) < 2:
            return None

        price_values = np.array(
            [bar.high if use_highs else bar.low for bar in bars],
            dtype=float,
        )

        if len(price_values) == 0:
            return None

        tolerance = 1e-6
        boundary_sign = 1.0 if use_highs else -1.0
        candidate_pairs = sorted(set(int(idx) for idx in pivot_indexes))

        recent_window = min(15, len(bars))
        min_pattern_bars = 10

        best_long_candidate: Optional[tuple[float, float, int, int, int, float]] = None
        best_long_key: Optional[tuple[float, int, int, int]] = None
        # tuple: (slope, intercept, touch_count, span, start_index, recent_avg_height)

        best_fallback_candidate: Optional[tuple[float, float, int, int, int, float]] = None
        best_fallback_key: Optional[tuple[int, int, float, int]] = None
        # tuple: (slope, intercept, touch_count, span, start_index, recent_avg_height)

        for left_pointer in range(len(candidate_pairs) - 1):
            i = candidate_pairs[left_pointer]
            if i < 0 or i >= len(bars):
                continue

            for right_pointer in range(left_pointer + 1, len(candidate_pairs)):
                j = candidate_pairs[right_pointer]
                if j < 0 or j >= len(bars):
                    continue

                dx = float(j - i)
                if np.isclose(dx, 0.0):
                    # Vertical line is invalid for y = m*x + b representation.
                    continue

                yi = float(price_values[i])
                yj = float(price_values[j])
                slope = (yj - yi) / dx
                intercept = yi - (slope * float(i))

                if not np.isfinite(slope) or not np.isfinite(intercept):
                    continue

                line_values = (slope * np.arange(len(bars), dtype=float)) + intercept
                if not np.all(np.isfinite(line_values)):
                    continue

                start_index = int(i)
                eval_end_index = self._formation_validation_end_index(len(bars))
                if eval_end_index <= start_index:
                    continue

                eval_prices = price_values[start_index:eval_end_index]
                eval_line_values = line_values[start_index:eval_end_index]
                if len(eval_prices) == 0:
                    continue

                # Upper boundary: all highs must be <= line.
                # Lower boundary: all lows must be >= line.
                boundary_diff = boundary_sign * (eval_prices - eval_line_values)
                early_tolerance_ratio = max(0.0, self.config.boundary_early_tolerance_pct) / 100.0
                late_tolerance_ratio = max(0.0, self.config.boundary_late_tolerance_pct) / 100.0
                tighten_start_ratio = max(
                    0.0,
                    min(1.0, self.config.boundary_tighten_start_ratio),
                )

                progress = np.linspace(0.0, 1.0, len(eval_prices), dtype=float)
                tighten_progress = np.clip(
                    (progress - tighten_start_ratio) / max(1e-6, 1.0 - tighten_start_ratio),
                    0.0,
                    1.0,
                )
                boundary_tolerance_ratio = (
                    early_tolerance_ratio * (1.0 - tighten_progress)
                ) + (late_tolerance_ratio * tighten_progress)
                boundary_tolerances = np.maximum(
                    tolerance,
                    np.maximum(np.abs(eval_line_values), np.abs(eval_prices))
                    * boundary_tolerance_ratio,
                )

                if np.any(boundary_diff > boundary_tolerances):
                    continue

                candidate_pivots = [
                    idx
                    for idx in candidate_pairs
                    if start_index <= idx < eval_end_index
                ]
                if len(candidate_pivots) < 2:
                    continue

                pivot_prices = np.array(
                    [float(price_values[idx]) for idx in candidate_pivots],
                    dtype=float,
                )
                pivot_line_values = (slope * np.array(candidate_pivots, dtype=float)) + intercept
                pivot_boundary_diff = boundary_sign * (pivot_prices - pivot_line_values)
                touch_tolerance_ratio = max(0.0, self.config.touch_tolerance_pct) / 100.0
                touch_tolerances = np.maximum(
                    tolerance,
                    np.maximum(
                        np.abs(pivot_line_values),
                        np.abs(pivot_prices),
                    ) * touch_tolerance_ratio,
                )
                touch_count = int(np.sum(np.abs(pivot_boundary_diff) <= touch_tolerances))
                span = int(j - i)

                pattern_length = int((len(bars) - 1) - start_index)
                recent_start = max(start_index, len(bars) - recent_window)
                recent_line_values = line_values[recent_start:len(bars)]
                if len(recent_line_values) == 0:
                    continue
                recent_avg_height = float(np.mean(recent_line_values))

                candidate = (
                    slope,
                    intercept,
                    touch_count,
                    span,
                    start_index,
                    recent_avg_height,
                )

                if pattern_length >= min_pattern_bars:
                    if self.config.prefer_converging_lines:
                        if use_highs:
                            # Prefer flatter/falling resistance first, then tighter recent height.
                            long_key = (
                                slope,
                                recent_avg_height,
                                -start_index,
                                -touch_count,
                                -span,
                            )
                        else:
                            # Prefer flatter/rising support first, then higher recent height.
                            long_key = (
                                -slope,
                                -recent_avg_height,
                                -start_index,
                                -touch_count,
                                -span,
                            )
                    elif use_highs:
                        long_key = (
                            recent_avg_height,
                            -start_index,
                            -touch_count,
                            -span,
                        )
                    else:
                        long_key = (
                            -recent_avg_height,
                            -start_index,
                            -touch_count,
                            -span,
                        )

                    if best_long_key is None or long_key < best_long_key:
                        best_long_key = long_key
                        best_long_candidate = candidate
                    continue

                if self.config.prefer_converging_lines:
                    if use_highs:
                        fallback_key = (
                            slope,
                            -touch_count,
                            -span,
                            recent_avg_height,
                            -start_index,
                        )
                    else:
                        fallback_key = (
                            -slope,
                            -touch_count,
                            -span,
                            -recent_avg_height,
                            -start_index,
                        )
                elif use_highs:
                    fallback_key = (
                        -touch_count,
                        -span,
                        recent_avg_height,
                        -start_index,
                    )
                else:
                    fallback_key = (
                        -touch_count,
                        -span,
                        -recent_avg_height,
                        -start_index,
                    )

                if best_fallback_key is None or fallback_key < best_fallback_key:
                    best_fallback_key = fallback_key
                    best_fallback_candidate = candidate

        selected_candidate = best_long_candidate or best_fallback_candidate
        if selected_candidate is None:
            return None

        slope, intercept, touch_count, _, start_index, _ = selected_candidate
        start_index_float = float(start_index)
        end_index = float(len(bars) - 1)
        start_price = float((slope * start_index_float) + intercept)
        end_price = float((slope * end_index) + intercept)

        if not np.isfinite(start_price) or not np.isfinite(end_price):
            return None

        return FittedLine(
            slope=float(slope),
            intercept=float(intercept),
            touch_count=touch_count,
            start_timestamp=self._to_unix_seconds(bars[start_index].date),
            start_price=start_price,
            end_timestamp=self._to_unix_seconds(bars[-1].date),
            end_price=end_price,
        )

    def _classify_triangle_type(
        self,
        upper_line: FittedLine,
        lower_line: FittedLine,
        average_close: float,
    ) -> Optional[str]:
        if average_close <= 0:
            return None

        upper_norm_slope_pct = (upper_line.slope / average_close) * 100.0
        lower_norm_slope_pct = (lower_line.slope / average_close) * 100.0

        is_upper_flat = abs(upper_norm_slope_pct) <= self.config.flat_eps_pct
        is_lower_flat = abs(lower_norm_slope_pct) <= self.config.flat_eps_pct
        upper_falling = upper_norm_slope_pct <= -self.config.trend_min_pct
        lower_rising = lower_norm_slope_pct >= self.config.trend_min_pct

        if is_upper_flat and lower_rising:
            return TRIANGLE_TYPE_ASCENDING

        if is_lower_flat and upper_falling:
            return TRIANGLE_TYPE_DESCENDING

        if upper_falling and lower_rising:
            return TRIANGLE_TYPE_SYMMETRICAL

        return None

    @staticmethod
    def _confidence_level(score: int) -> str:
        if score >= 75:
            return "high"
        if score >= 55:
            return "medium"
        return "low"

    def _compute_confidence(
        self,
        state: str,
        breakout_close_count: int,
        compression_ratio: float,
        upper_touches: int,
        lower_touches: int,
        formation_span_bars: int,
        volume_ratio: Optional[float],
        apex_proximity_ratio: float,
        breakout_margin_pct: float,
    ) -> int:
        if state == TRIANGLE_STATE_POTENTIAL:
            score = 40.0
        elif breakout_close_count >= 2:
            score = 72.0
        else:
            score = 58.0

        # Reward tighter, better-balanced triangles that are forming closer to the apex.
        compression_bonus = max(0.0, (0.8 - compression_ratio) / 0.2) * 8.0
        score += min(8.0, compression_bonus)

        total_touches = upper_touches + lower_touches
        if total_touches > 4:
            score += min(8.0, float(total_touches - 4) * 2.0)

        touch_balance_denominator = max(upper_touches, lower_touches)
        if touch_balance_denominator > 0:
            touch_balance_ratio = min(upper_touches, lower_touches) / touch_balance_denominator
            score += 4.0 * touch_balance_ratio

        if formation_span_bars > 0:
            touch_efficiency = total_touches / float(formation_span_bars)
            score += min(8.0, touch_efficiency * 40.0)

            if formation_span_bars > 30:
                score -= min(6.0, float(formation_span_bars - 30) * 0.2)

        score += 4.0 * max(0.0, min(1.0, apex_proximity_ratio))

        if state == TRIANGLE_STATE_BREAKOUT:
            score += min(6.0, max(0.0, breakout_margin_pct) * 300.0)

        if volume_ratio is not None:
            score += min(6.0, max(0.0, (volume_ratio - 1.0) * 8.0))

        return int(max(0.0, min(100.0, round(score))))

    def _count_breakout_closes(
        self,
        bars: Sequence[PriceBar],
        upper_line: FittedLine,
        lower_line: FittedLine,
        direction: str,
    ) -> int:
        count = 0
        breakout_multiplier = self._effective_breakout_buffer_ratio()

        for idx in range(len(bars) - 1, -1, -1):
            close_value = bars[idx].close
            upper_value = upper_line.y(float(idx))
            lower_value = lower_line.y(float(idx))

            if direction == BREAKOUT_DIRECTION_BULLISH:
                threshold = upper_value * (1.0 + breakout_multiplier)
                is_breakout = close_value > threshold
            else:
                threshold = lower_value * (1.0 - breakout_multiplier)
                is_breakout = close_value < threshold

            if not is_breakout:
                break

            count += 1

        return count

    def _build_event(
        self,
        bars: Sequence[PriceBar],
        triangle_type: str,
        state: str,
        breakout_direction: Optional[str],
        breakout_close_count: int,
        upper_line: FittedLine,
        lower_line: FittedLine,
        apex_x: float,
        compression_ratio: float,
        formation_span_bars: int,
        volume_ratio: Optional[float],
    ) -> TriangleEvent:
        last_index = len(bars) - 1
        max_apex_extension = max(
            1.0,
            float(self.config.lookback_bars * self.config.max_apex_extension_ratio),
        )
        apex_extension_ratio = max(0.0, min(1.0, (apex_x - float(last_index)) / max_apex_extension))
        apex_proximity_ratio = 1.0 - apex_extension_ratio

        breakout_margin_pct = 0.0
        latest_close = bars[-1].close
        if state == TRIANGLE_STATE_BREAKOUT and breakout_direction is not None:
            breakout_multiplier = self._effective_breakout_buffer_ratio()
            if breakout_direction == BREAKOUT_DIRECTION_BULLISH:
                breakout_threshold = upper_line.y(float(last_index)) * (1.0 + breakout_multiplier)
                if breakout_threshold > 0:
                    breakout_margin_pct = max(
                        0.0,
                        (latest_close - breakout_threshold) / breakout_threshold,
                    )
            else:
                breakout_threshold = lower_line.y(float(last_index)) * (1.0 - breakout_multiplier)
                if breakout_threshold > 0:
                    breakout_margin_pct = max(
                        0.0,
                        (breakout_threshold - latest_close) / breakout_threshold,
                    )

        confidence_score = self._compute_confidence(
            state=state,
            breakout_close_count=breakout_close_count,
            compression_ratio=compression_ratio,
            upper_touches=upper_line.touch_count,
            lower_touches=lower_line.touch_count,
            formation_span_bars=formation_span_bars,
            volume_ratio=volume_ratio,
            apex_proximity_ratio=apex_proximity_ratio,
            breakout_margin_pct=breakout_margin_pct,
        )
        confidence_level = self._confidence_level(confidence_score)

        upper_now = upper_line.y(float(last_index))
        lower_now = lower_line.y(float(last_index))

        if state == TRIANGLE_STATE_POTENTIAL:
            line_style = "dashed"
            color_hex = "#06B6D4"
            signal_index = last_index
            invalidation_level = None
            action = (
                f"Potential {triangle_type} triangle compression. Await breakout confirmation."
            )
        else:
            line_style = "solid"
            signal_index = max(0, len(bars) - breakout_close_count)

            if breakout_direction == BREAKOUT_DIRECTION_BULLISH:
                color_hex = "#22C55E"
                invalidation_level = lower_now
                if breakout_close_count >= 2:
                    action = (
                        f"Bullish triangle breakout confirmed ({breakout_close_count} closes)."
                    )
                else:
                    action = "Bullish triangle breakout signaled (1 close)."
            else:
                color_hex = "#EF4444"
                invalidation_level = upper_now
                if breakout_close_count >= 2:
                    action = (
                        f"Bearish triangle breakout confirmed ({breakout_close_count} closes)."
                    )
                else:
                    action = "Bearish triangle breakout signaled (1 close)."

        apex_extension_days = max(0, int(round(apex_x - (len(bars) - 1))))
        apex_date = bars[-1].date + timedelta(days=apex_extension_days)

        return TriangleEvent(
            triangle_type=triangle_type,
            state=state,
            breakout_direction=breakout_direction,
            line_style=line_style,
            color_hex=color_hex,
            confidence_level=confidence_level,
            confidence_score=confidence_score,
            upper_touch_count=upper_line.touch_count,
            lower_touch_count=lower_line.touch_count,
            total_touch_count=upper_line.touch_count + lower_line.touch_count,
            breakout_close_count=breakout_close_count,
            volume_ratio=(round(volume_ratio, 4) if volume_ratio is not None else None),
            upper_line={
                "start_timestamp": upper_line.start_timestamp,
                "start_price": round(upper_line.start_price, 4),
                "end_timestamp": upper_line.end_timestamp,
                "end_price": round(upper_line.end_price, 4),
            },
            lower_line={
                "start_timestamp": lower_line.start_timestamp,
                "start_price": round(lower_line.start_price, 4),
                "end_timestamp": lower_line.end_timestamp,
                "end_price": round(lower_line.end_price, 4),
            },
            formation_start_timestamp=min(
                upper_line.start_timestamp,
                lower_line.start_timestamp,
            ),
            apex_timestamp=self._to_unix_seconds(apex_date),
            signal_timestamp=self._to_unix_seconds(bars[signal_index].date),
            invalidation_level=(
                round(invalidation_level, 4)
                if invalidation_level is not None
                else None
            ),
            action=action,
        )

    def detect_for_ticker(self, ticker_id: int) -> List[Dict[str, object]]:
        bars = self._fetch_prices(ticker_id=ticker_id)

        if len(bars) < self.config.lookback_bars:
            return []

        pivot_highs = self._find_pivot_highs(bars)
        pivot_lows = self._find_pivot_lows(bars)

        if len(pivot_highs) < self.config.min_touches_upper:
            return []
        if len(pivot_lows) < self.config.min_touches_lower:
            return []

        upper_line = self._fit_line(bars=bars, pivot_indexes=pivot_highs, use_highs=True)
        lower_line = self._fit_line(bars=bars, pivot_indexes=pivot_lows, use_highs=False)

        if not upper_line or not lower_line:
            return []

        last_index = float(len(bars) - 1)
        pattern_start_timestamp = min(upper_line.start_timestamp, lower_line.start_timestamp)

        pattern_start_index = 0
        for idx, bar in enumerate(bars):
            if self._to_unix_seconds(bar.date) >= pattern_start_timestamp:
                pattern_start_index = idx
                break

        gap_start = (
            upper_line.y(float(pattern_start_index))
            - lower_line.y(float(pattern_start_index))
        )
        gap_end = upper_line.y(last_index) - lower_line.y(last_index)

        if not (gap_start > gap_end > 0):
            return []

        compression_ratio = gap_end / gap_start
        if compression_ratio > 0.8:
            return []

        denominator = upper_line.slope - lower_line.slope
        if np.isclose(denominator, 0.0):
            return []

        apex_x = (lower_line.intercept - upper_line.intercept) / denominator
        if not np.isfinite(apex_x):
            return []

        if apex_x <= last_index:
            return []

        max_apex_x = last_index + (self.config.lookback_bars * self.config.max_apex_extension_ratio)
        if apex_x > max_apex_x:
            return []

        average_close = float(np.mean([bar.close for bar in bars]))
        triangle_type = self._classify_triangle_type(upper_line, lower_line, average_close)
        if triangle_type is None:
            return []

        latest_close = bars[-1].close
        current_upper = upper_line.y(last_index)
        current_lower = lower_line.y(last_index)

        inside_lower_bound = current_lower * (1.0 + (self.config.inside_buffer_pct / 100.0))
        inside_upper_bound = current_upper * (1.0 - (self.config.inside_buffer_pct / 100.0))

        breakout_multiplier = self._effective_breakout_buffer_ratio()
        breakout_up_threshold = current_upper * (1.0 + breakout_multiplier)
        breakout_down_threshold = current_lower * (1.0 - breakout_multiplier)

        state: Optional[str] = None
        breakout_direction: Optional[str] = None
        breakout_close_count = 0

        if inside_lower_bound <= latest_close <= inside_upper_bound:
            state = TRIANGLE_STATE_POTENTIAL
        elif latest_close > breakout_up_threshold:
            state = TRIANGLE_STATE_BREAKOUT
            breakout_direction = BREAKOUT_DIRECTION_BULLISH
            breakout_close_count = self._count_breakout_closes(
                bars=bars,
                upper_line=upper_line,
                lower_line=lower_line,
                direction=BREAKOUT_DIRECTION_BULLISH,
            )
        elif latest_close < breakout_down_threshold:
            state = TRIANGLE_STATE_BREAKOUT
            breakout_direction = BREAKOUT_DIRECTION_BEARISH
            breakout_close_count = self._count_breakout_closes(
                bars=bars,
                upper_line=upper_line,
                lower_line=lower_line,
                direction=BREAKOUT_DIRECTION_BEARISH,
            )

        if state is None:
            return []

        if state == TRIANGLE_STATE_BREAKOUT and breakout_close_count <= 0:
            return []

        recent_volumes = [
            bar.volume
            for bar in bars[-self.config.volume_avg_window:]
            if bar.volume is not None and bar.volume > 0
        ]
        latest_volume = bars[-1].volume
        volume_ratio: Optional[float] = None

        if recent_volumes and latest_volume is not None and latest_volume > 0:
            average_volume = float(np.mean(recent_volumes))
            if average_volume > 0:
                volume_ratio = float(latest_volume / average_volume)

        event = self._build_event(
            bars=bars,
            triangle_type=triangle_type,
            state=state,
            breakout_direction=breakout_direction,
            breakout_close_count=breakout_close_count,
            upper_line=upper_line,
            lower_line=lower_line,
            apex_x=float(apex_x),
            compression_ratio=float(compression_ratio),
            formation_span_bars=len(bars) - pattern_start_index,
            volume_ratio=volume_ratio,
        )

        events = [event.as_dict()]
        events.sort(
            key=lambda item: (
                -int(item["signal_timestamp"]),
                self._state_priority(str(item["state"])),
                -int(item["confidence_score"]),
            )
        )
        return events

    def detect_recent_market_triangles(
        self,
        days: int = 7,
        index_id: Optional[int] = None,
    ) -> List[Dict[str, object]]:
        cutoff_timestamp = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())

        tickers_query = (
            self.db.query(Ticker.id, Ticker.symbol, Ticker.name)
            .filter(Ticker.is_active)
        )
        if index_id is not None:
            tickers_query = tickers_query.filter(Ticker.index_id == index_id)

        tickers = tickers_query.all()
        results: List[Dict[str, object]] = []

        for ticker in tickers:
            events = self.detect_for_ticker(ticker.id)
            for event in events:
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
            key=lambda item: (
                -int(item["signal_timestamp"]),
                self._state_priority(str(item["state"])),
                -int(item["confidence_score"]),
            )
        )
        return results
