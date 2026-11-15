from typing import List

import numpy as np
import pandas as pd

from .base import BaseIndicator, IndicatorResult
from .registry import register_indicator


@register_indicator
class RSI(BaseIndicator):
    """
    Relative Strength Index (RSI) indicator.

    RSI measures the speed and magnitude of price movements.
    Values range from 0 to 100.

    Interpretation:
    - RSI > 70: Overbought condition
    - RSI < 30: Oversold condition

    Formula:
    RS = Average Gain / Average Loss (over n periods)
    RSI = 100 - (100 / (1 + RS))
    """

    name = "rsi"
    required_columns = ["close"]

    def __init__(self, period: int = 14):
        """
        Initialize RSI indicator.

        Args:
            period: Number of periods for RSI calculation (default: 14)
        """
        super().__init__()
        self.period = period

    def get_required_history_days(self) -> int:
        # Need period + 1 for initial calculation
        return self.period + 1

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate RSI for each date.

        Uses Wilder's Smoothing (same as TradingView/Industry standard).

        Args:
            df: DataFrame with 'date' and 'close' columns

        Returns:
            List of IndicatorResult objects
        """
        df = self.prepare_dataframe(df)

        # Calculate price changes
        delta = df["close"].diff()

        # Separate gains and losses
        gain = delta.where(delta > 0, 0)
        loss = (-delta).where(delta < 0, 0)

        results: List[IndicatorResult] = []
        if len(df) <= self.period:
            return results

        # Wilder (1978): seed the averages with the simple mean of the first `period` changes
        # (bars 1..period). The first RSI is reported at bar `period` from that seed; Wilder
        # smoothing applies from bar period+1 on. (Previously bar `period` was applied twice.)
        avg_gain = float(gain.iloc[1 : self.period + 1].mean())
        avg_loss = float(loss.iloc[1 : self.period + 1].mean())

        for idx in range(self.period, len(df)):
            if idx > self.period:
                avg_gain = (avg_gain * (self.period - 1) + float(gain.iloc[idx])) / self.period
                avg_loss = (avg_loss * (self.period - 1) + float(loss.iloc[idx])) / self.period

            rsi_value = self._rsi_from_averages(avg_gain, avg_loss)
            if not np.isnan(rsi_value):
                results.append(IndicatorResult(date=df.iloc[idx]["date"], value=float(rsi_value)))

        return results

    @staticmethod
    def _rsi_from_averages(avg_gain: float, avg_loss: float) -> float:
        """RSI = 100 - 100 / (1 + RS). No losses: 100; no gains and no losses (flat): 50,
        the neutral value TA-Lib also returns, so suspended or untraded stretches don't
        read as overbought."""
        if avg_loss == 0:
            return 50.0 if avg_gain == 0 else 100.0
        return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)

    @property
    def display_name(self) -> str:
        return f"RSI({self.period})"
