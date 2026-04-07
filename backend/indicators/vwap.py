from typing import List
import pandas as pd
import numpy as np

from .base import BaseIndicator, IndicatorResult
from .registry import register_indicator


@register_indicator
class VWAP(BaseIndicator):
    """
    Volume Weighted Average Price (VWAP) indicator.

    VWAP calculates the average price weighted by volume.
    It's commonly used as a trading benchmark by institutional investors.

    Formula:
    Typical Price = (High + Low + Close) / 3
    VWAP = Cumulative(Typical Price × Volume) / Cumulative(Volume)

    Note: VWAP is typically calculated intraday and resets at market open.
    For daily data, this represents a cumulative VWAP from the first available date.
    """

    name = "vwap"
    required_columns = ["high", "low", "close", "volume"]

    def __init__(self, reset_daily: bool = False):
        """
        Initialize VWAP indicator.

        Args:
            reset_daily: If True, reset VWAP calculation for each day.
                        For daily data, this effectively makes VWAP = Typical Price.
                        Default: False (cumulative calculation)
        """
        super().__init__()
        self.reset_daily = reset_daily

    def get_required_history_days(self) -> int:
        # VWAP can be calculated from day 1
        return 1

    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate VWAP for each date.

        Args:
            df: DataFrame with 'date', 'high', 'low', 'close', and 'volume' columns

        Returns:
            List of IndicatorResult objects
        """
        df = self.prepare_dataframe(df)

        # Calculate typical price
        typical_price = (df['high'] + df['low'] + df['close']) / 3

        # Calculate cumulative TP * Volume and cumulative Volume
        tp_volume = typical_price * df['volume']

        if self.reset_daily:
            # For daily data with reset_daily, VWAP equals typical price
            vwap = typical_price
        else:
            # Cumulative VWAP
            cum_tp_volume = tp_volume.cumsum()
            cum_volume = df['volume'].cumsum()
            vwap = cum_tp_volume / cum_volume

        results = []
        for idx in range(len(df)):
            if not pd.isna(vwap.iloc[idx]) and not np.isinf(vwap.iloc[idx]):
                results.append(IndicatorResult(
                    date=df.iloc[idx]['date'],
                    value=float(vwap.iloc[idx]),
                    metadata={
                        "typical_price": float(typical_price.iloc[idx]),
                        "cumulative_volume": int(cum_volume.iloc[idx]) if not self.reset_daily else int(df['volume'].iloc[idx])
                    }
                ))

        return results

    @property
    def display_name(self) -> str:
        return "VWAP"