from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import date
import pandas as pd


@dataclass
class IndicatorResult:
    """Result of a technical indicator calculation for a single date"""
    date: date
    value: float
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "date": self.date,
            "value": self.value,
            "metadata": self.metadata
        }


class BaseIndicator(ABC):
    """
    Abstract base class for all technical indicators.

    Provides a composable interface for calculating various technical indicators.
    Each indicator must implement:
    - name: unique identifier for the indicator
    - required_columns: list of column names needed from the DataFrame
    - calculate(): method that performs the calculation
    - get_required_history_days(): minimum days of data needed
    """

    name: str = "base"
    required_columns: List[str] = []

    def __init__(self, **params):
        """Initialize indicator with optional parameters"""
        self.params = params

    @abstractmethod
    def calculate(self, df: pd.DataFrame) -> List[IndicatorResult]:
        """
        Calculate indicator from DataFrame with OHLCV data.

        Args:
            df: DataFrame with columns: date, open, high, low, close, volume

        Returns:
            List of IndicatorResult objects for each date where calculation is valid
        """
        pass

    @abstractmethod
    def get_required_history_days(self) -> int:
        """
        Return minimum number of historical days needed for calculation.

        Returns:
            Minimum days of data required for first valid calculation
        """
        pass

    def validate_dataframe(self, df: pd.DataFrame) -> bool:
        """
        Validate that DataFrame has all required columns.

        Args:
            df: DataFrame to validate

        Returns:
            True if valid, raises ValueError otherwise
        """
        missing = [col for col in self.required_columns if col not in df.columns]
        if missing:
            raise ValueError(f"DataFrame missing required columns: {missing}")
        return True

    def prepare_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare DataFrame for calculation (sort by date, validate columns).

        Args:
            df: Input DataFrame

        Returns:
            Sorted and validated DataFrame
        """
        self.validate_dataframe(df)

        # Ensure date column exists and is sorted
        if 'date' in df.columns:
            df = df.sort_values('date').reset_index(drop=True)

        return df