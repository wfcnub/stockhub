from typing import List

import pandas as pd

from .base import BaseIndicator, IndicatorResult
from .registry import register_indicator


@register_indicator
class MACD(BaseIndicator):
    """
    Moving Average Convergence Divergence (MACD) indicator.

    MACD shows the relationship between two moving averages of prices.

    Components:
    - MACD Line: MA(12) - MA(26)
    - Signal Line: MA(9) of MACD Line
    - Histogram: MACD Line - Signal Line

    MA type is configurable (`sma` or `ema`) and defaults to `sma`.
    Default periods (12, 26, 9) are a common baseline for daily charts.
    """

    name = "macd"
    required_columns = ["close"]

    def __init__(
        self,
        fast_period: int = 12,
        slow_period: int = 26,
        signal_period: int = 9,
        ma_type: str = "sma",
    ):
        """
        Initialize MACD indicator.

        Args:
            fast_period: Period for fast MA (default: 12)
            slow_period: Period for slow MA (default: 26)
            signal_period: Period for signal line MA (default: 9)
            ma_type: Moving-average type: `sma` or `ema` (default: sma)
        """
        super().__init__()
        normalized_ma_type = (ma_type or "sma").lower()
        if normalized_ma_type not in {"sma", "ema"}:
            raise ValueError("ma_type must be either 'sma' or 'ema'")

        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signal_period = signal_period
        self.ma_type = normalized_ma_type

    def get_required_history_days(self) -> int:
        # Need enough data for slow MA window + signal MA window
        return self.slow_period + self.signal_period + 10

    def _moving_average(self, series: pd.Series, period: int) -> pd.Series:
        if self.ma_type == "ema":
            return series.ewm(span=period, adjust=False).mean()

        return series.rolling(window=period, min_periods=period).mean()

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate MACD for each date.

        Args:
            df: DataFrame with 'date' and 'close' columns

        Returns:
            List of IndicatorResult objects with MACD line, signal, and histogram in metadata
        """
        df = self.prepare_dataframe(df)

        # Calculate fast and slow moving averages using configured mode.
        fast_ma = self._moving_average(df['close'], self.fast_period)
        slow_ma = self._moving_average(df['close'], self.slow_period)

        # MACD Line
        macd_line = fast_ma - slow_ma

        # Signal Line (9-period moving average of MACD Line)
        signal_line = self._moving_average(macd_line, self.signal_period)

        # Histogram
        histogram = macd_line - signal_line

        # Need enough data for slow MA + signal MA windows
        min_idx = self.slow_period + self.signal_period - 2

        results = []
        for idx in range(len(df)):
            if idx >= min_idx and not pd.isna(macd_line.iloc[idx]):
                results.append(IndicatorResult(
                    date=df.iloc[idx]['date'],
                    value=float(macd_line.iloc[idx]),
                    metadata={
                        "signal": float(signal_line.iloc[idx]),
                        "histogram": float(histogram.iloc[idx]),
                        "ma_type": self.ma_type,
                    }
                ))

        return results

    @property
    def display_name(self) -> str:
        return f"MACD({self.fast_period},{self.slow_period},{self.signal_period})"
