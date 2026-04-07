from typing import List
import pandas as pd
import numpy as np

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
        delta = df['close'].diff()

        # Separate gains and losses
        gain = delta.where(delta > 0, 0)
        loss = (-delta).where(delta < 0, 0)

        # Use Wilder's Smoothing (exponential moving average)
        # First average is simple average of first 'period' values
        avg_gain = gain.iloc[1:self.period + 1].mean()
        avg_loss = loss.iloc[1:self.period + 1].mean()

        results = []

        # Calculate RSI for each period after the initial averaging
        for idx in range(self.period, len(df)):
            # Update averages using Wilder's smoothing
            current_gain = gain.iloc[idx]
            current_loss = loss.iloc[idx]

            avg_gain = (avg_gain * (self.period - 1) + current_gain) / self.period
            avg_loss = (avg_loss * (self.period - 1) + current_loss) / self.period

            if avg_loss == 0:
                rsi_value = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi_value = 100 - (100 / (1 + rs))

            if not np.isnan(rsi_value):
                results.append(IndicatorResult(
                    date=df.iloc[idx]['date'],
                    value=float(rsi_value)
                ))

        return results

    @property
    def display_name(self) -> str:
        return f"RSI({self.period})"