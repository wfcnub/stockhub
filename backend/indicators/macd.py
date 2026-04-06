from typing import List
import pandas as pd

from .base import BaseIndicator, IndicatorResult
from .registry import register_indicator


@register_indicator
class MACD(BaseIndicator):
    """
    Moving Average Convergence Divergence (MACD) indicator.

    MACD shows the relationship between two exponential moving averages of prices.

    Components:
    - MACD Line: EMA(12) - EMA(26)
    - Signal Line: EMA(9) of MACD Line
    - Histogram: MACD Line - Signal Line

    Default parameters (12, 26, 9) are standard for daily charts.
    """

    name = "macd"
    required_columns = ["close"]

    def __init__(self, fast_period: int = 12, slow_period: int = 26, signal_period: int = 9):
        """
        Initialize MACD indicator.

        Args:
            fast_period: Period for fast EMA (default: 12)
            slow_period: Period for slow EMA (default: 26)
            signal_period: Period for signal line EMA (default: 9)
        """
        super().__init__()
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signal_period = signal_period

    def get_required_history_days(self) -> int:
        # Need enough data for slow EMA to stabilize + signal EMA
        return self.slow_period + self.signal_period + 10

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate MACD for each date.

        Args:
            df: DataFrame with 'date' and 'close' columns

        Returns:
            List of IndicatorResult objects with MACD line, signal, and histogram in metadata
        """
        df = self.prepare_dataframe(df)

        # Calculate fast and slow EMAs
        fast_ema = df['close'].ewm(span=self.fast_period, adjust=False).mean()
        slow_ema = df['close'].ewm(span=self.slow_period, adjust=False).mean()

        # MACD Line
        macd_line = fast_ema - slow_ema

        # Signal Line (9-period EMA of MACD Line)
        signal_line = macd_line.ewm(span=self.signal_period, adjust=False).mean()

        # Histogram
        histogram = macd_line - signal_line

        # Need enough data for slow EMA + signal EMA to stabilize
        min_idx = self.slow_period + self.signal_period - 2

        results = []
        for idx in range(len(df)):
            if idx >= min_idx and not pd.isna(macd_line.iloc[idx]):
                results.append(IndicatorResult(
                    date=str(df.iloc[idx]['date']),
                    value=float(macd_line.iloc[idx]),
                    metadata={
                        "signal": float(signal_line.iloc[idx]),
                        "histogram": float(histogram.iloc[idx])
                    }
                ))

        return results

    @property
    def display_name(self) -> str:
        return f"MACD({self.fast_period},{self.slow_period},{self.signal_period})"