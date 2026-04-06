"""
Indicator calculation service
"""
from typing import List, Dict, Any, Type
from sqlalchemy.orm import Session
from datetime import datetime
import pandas as pd

from app.models.price import DailyPrice
from app.models.indicator import TechnicalIndicator
from app.models.ticker import Ticker
from indicators.base import BaseIndicator
from indicators.registry import IndicatorRegistry
from indicators.moving_averages import SMA, EMA
from indicators.macd import MACD
from indicators.rsi import RSI
from indicators.vwap import VWAP


# Default indicator configurations
DEFAULT_MA_PERIODS = [5, 10, 15, 20, 50, 100, 200]
DEFAULT_MACD_PARAMS = {"fast_period": 12, "slow_period": 26, "signal_period": 9}
DEFAULT_RSI_PERIOD = 14


class IndicatorCalcService:
    """Service for calculating and storing technical indicators"""

    def __init__(self, db: Session):
        self.db = db

    def get_indicator_instances(self) -> List[BaseIndicator]:
        """
        Get all default indicator instances to calculate during sync.

        Returns:
            List of configured indicator instances
        """
        indicators = []

        # Moving Averages (SMA and EMA for each period)
        for period in DEFAULT_MA_PERIODS:
            indicators.append(SMA(period=period))
            indicators.append(EMA(period=period))

        # MACD with standard parameters
        indicators.append(MACD(
            fast_period=DEFAULT_MACD_PARAMS["fast_period"],
            slow_period=DEFAULT_MACD_PARAMS["slow_period"],
            signal_period=DEFAULT_MACD_PARAMS["signal_period"]
        ))

        # RSI with standard period
        indicators.append(RSI(period=DEFAULT_RSI_PERIOD))

        # VWAP (calculated daily)
        indicators.append(VWAP())

        return indicators

    def calculate_for_ticker(
        self,
        ticker_id: int,
        indicators: List[BaseIndicator] = None
    ) -> Dict[str, int]:
        """
        Calculate all indicators for a ticker and store in database.

        Args:
            ticker_id: ID of the ticker
            indicators: List of indicators to calculate (default: all)

        Returns:
            Dict with count of calculated values per indicator
        """
        if indicators is None:
            indicators = self.get_indicator_instances()

        # Fetch all prices for this ticker
        prices = self.db.query(DailyPrice).filter(
            DailyPrice.ticker_id == ticker_id
        ).order_by(DailyPrice.date).all()

        if not prices:
            return {}

        # Convert to DataFrame for indicator calculations
        df = pd.DataFrame([{
            'date': p.date,
            'open': p.open,
            'high': p.high,
            'low': p.low,
            'close': p.close,
            'volume': p.volume
        } for p in prices])

        results = {}

        for indicator in indicators:
            # Calculate indicator
            indicator_results = indicator.calculate(df)

            if not indicator_results:
                results[indicator.name] = 0
                continue

            # Get existing indicators to avoid duplicates
            existing = self.db.query(TechnicalIndicator).filter(
                TechnicalIndicator.ticker_id == ticker_id,
                TechnicalIndicator.indicator_type == indicator.name,
                TechnicalIndicator.window_period == getattr(indicator, 'period', None)
            ).all()

            existing_dates = {e.date for e in existing}

            # Insert new values
            new_count = 0
            for result in indicator_results:
                if result.date not in existing_dates:
                    db_indicator = TechnicalIndicator(
                        ticker_id=ticker_id,
                        date=result.date,
                        indicator_type=indicator.name,
                        window_period=getattr(indicator, 'period', None),
                        value=result.value,
                        metadata=result.metadata
                    )
                    self.db.add(db_indicator)
                    new_count += 1

            results[indicator.name] = new_count

        self.db.commit()
        return results

    def calculate_incremental(
        self,
        ticker_id: int,
        start_date: datetime,
        indicators: List[BaseIndicator] = None
    ) -> Dict[str, int]:
        """
        Calculate indicators only for new dates (incremental update).

        More efficient than full recalculation when only a few
        new data points exist.

        Args:
            ticker_id: ID of the ticker
            start_date: Date to start calculations from
            indicators: List of indicators to calculate

        Returns:
            Dict with count of calculated values per indicator
        """
        if indicators is None:
            indicators = self.get_indicator_instances()

        # Get max history days needed
        max_history = max(ind.get_required_history_days() for ind in indicators)

        # Fetch prices with lookback period
        prices = self.db.query(DailyPrice).filter(
            DailyPrice.ticker_id == ticker_id,
            DailyPrice.date >= (start_date - timedelta(days=max_history * 2))
        ).order_by(DailyPrice.date).all()

        if not prices:
            return {}

        df = pd.DataFrame([{
            'date': p.date,
            'open': p.open,
            'high': p.high,
            'low': p.low,
            'close': p.close,
            'volume': p.volume
        } for p in prices])

        results = {}

        for indicator in indicators:
            indicator_results = indicator.calculate(df)

            # Filter to only new dates
            new_results = [
                r for r in indicator_results
                if pd.to_datetime(r.date).date() >= start_date.date()
            ]

            # Insert new values
            new_count = 0
            for result in new_results:
                # Check if exists
                exists = self.db.query(TechnicalIndicator).filter(
                    TechnicalIndicator.ticker_id == ticker_id,
                    TechnicalIndicator.indicator_type == indicator.name,
                    TechnicalIndicator.date == result.date,
                    TechnicalIndicator.window_period == getattr(indicator, 'period', None)
                ).first()

                if not exists:
                    db_indicator = TechnicalIndicator(
                        ticker_id=ticker_id,
                        date=result.date,
                        indicator_type=indicator.name,
                        window_period=getattr(indicator, 'period', None),
                        value=result.value,
                        metadata=result.metadata
                    )
                    self.db.add(db_indicator)
                    new_count += 1

            results[indicator.name] = new_count

        self.db.commit()
        return results