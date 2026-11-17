from typing import List

import numpy as np
import pandas as pd

from .base import BaseIndicator, IndicatorResult
from .registry import register_indicator


def ema_sma_seeded(values: pd.Series, period: int) -> pd.Series:
    """EMA with k = 2/(period+1), seeded with the SMA of the first `period` values.

    Canonical definition (StockCharts ChartSchool; TA-Lib EMA). Leading NaNs are skipped, so the
    seed is the mean of the first `period` valid values; bars before the seed are NaN.
    A NaN after the seed propagates (the input is expected to be gap-free once it starts).
    """
    arr = values.to_numpy(dtype=float)
    out = np.full(arr.shape, np.nan)
    valid = np.flatnonzero(~np.isnan(arr))
    if period < 1 or valid.size == 0:
        return pd.Series(out, index=values.index)
    start = int(valid[0])
    seed_idx = start + period - 1
    if seed_idx >= arr.size:
        return pd.Series(out, index=values.index)
    k = 2.0 / (period + 1)
    prev = float(np.mean(arr[start : seed_idx + 1]))
    out[seed_idx] = prev
    for i in range(seed_idx + 1, arr.size):
        prev = arr[i] * k + prev * (1.0 - k)
        out[i] = prev
    return pd.Series(out, index=values.index)


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

        sma = df["close"].rolling(window=self.window).mean()

        results = []
        for idx in range(len(df)):
            if not pd.isna(sma.iloc[idx]):
                results.append(
                    IndicatorResult(date=df.iloc[idx]["date"], value=float(sma.iloc[idx]))
                )

        return results


@register_indicator
class EMA(BaseIndicator):
    """
    Exponential Moving Average (EMA) indicator.

    Gives more weight to recent prices, making it more responsive to new information.

    Formula: EMA = Price × k + Previous EMA × (1 - k)
             where k = 2 / (window + 1)
    The first value (at bar window-1) is the SMA of the first `window` closes, as in
    StockCharts and TA-Lib.
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

        ema = ema_sma_seeded(df["close"], self.window)

        results = []
        for idx in range(len(df)):
            if not pd.isna(ema.iloc[idx]):
                results.append(
                    IndicatorResult(date=df.iloc[idx]["date"], value=float(ema.iloc[idx]))
                )

        return results
