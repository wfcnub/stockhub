from typing import List
import pandas as pd

from .base import BaseIndicator, IndicatorResult
from .registry import register_indicator


@register_indicator
class SMA(BaseIndicator):
    """
    Simple Moving Average (SMA) indicator.

    Calculates the arithmetic mean of prices over a specified number of periods.

    Formula: SMA = Sum of prices / n periods
    """

    name = "sma"
    required_columns = ["close"]

    def __init__(self, window: int = 20):
        """
        Initialize SMA indicator.

        Args:
            window: Number of periods for the moving average
        """
        super().__init__()
        self.window = window

    def get_required_history_days(self) -> int:
        return self.window

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate SMA for each date.

        Args:
            df: DataFrame with 'date' and 'close' columns

        Returns:
            List of IndicatorResult objects
        """
        df = self.prepare_dataframe(df)

        sma = df['close'].rolling(window=self.window).mean()

        results = []
        for idx in range(len(df)):
            if not pd.isna(sma.iloc[idx]):
                results.append(IndicatorResult(
                    date=df.iloc[idx]['date'],
                    value=float(sma.iloc[idx])
                ))

        return results


@register_indicator
class EMA(BaseIndicator):
    """
    Exponential Moving Average (EMA) indicator.

    Gives more weight to recent prices, making it more responsive to new information.

    Formula: EMA = Price × k + Previous EMA × (1 - k)
             where k = 2 / (window + 1)
    """

    name = "ema"
    required_columns = ["close"]

    def __init__(self, window: int = 20):
        """
        Initialize EMA indicator.

        Args:
            window: Number of periods for the moving average
        """
        super().__init__()
        self.window = window

    def get_required_history_days(self) -> int:
        return self.window + 1  # Need extra day for initial SMA

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate EMA for each date.

        Args:
            df: DataFrame with 'date' and 'close' columns

        Returns:
            List of IndicatorResult objects
        """
        df = self.prepare_dataframe(df)

        # Calculate EMA using pandas ewm
        # span = window gives the correct smoothing factor: k = 2/(window+1)
        ema = df['close'].ewm(span=self.window, adjust=False).mean()

        results = []
        for idx in range(len(df)):
            # EMA needs at least 'window' periods for a stable calculation
            if idx >= self.window - 1:
                results.append(IndicatorResult(
                    date=df.iloc[idx]['date'],
                    value=float(ema.iloc[idx])
                ))

        return results