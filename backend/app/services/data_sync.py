"""
Data synchronization service for downloading and updating stock data
"""
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.ticker import Ticker
from app.models.price import DailyPrice, SyncStatus
from app.models.indicator import TechnicalIndicator
from app.services.ticker_fetcher import TickerFetcher
from app.config import settings
from indicators.registry import IndicatorRegistry
from indicators.base import IndicatorResult
from app.data_downloader import download_stock_data
import pandas as pd


class DataSyncService:
    """Service for syncing stock data from Yahoo Finance"""

    # Moving average windows from config
    MA_PERIODS = settings.MA_WINDOWS

    def __init__(self, db: Session, exchange: str = "IDX"):
        self.db = db
        self.exchange = exchange
        self.fetcher = TickerFetcher(exchange)

    def get_last_sync_date(self, ticker_id: int) -> Optional[date]:
        """Get the last date for which we have price data"""
        last_price = self.db.query(DailyPrice).filter(
            DailyPrice.ticker_id == ticker_id
        ).order_by(DailyPrice.date.desc()).first()

        return last_price.date if last_price else None

    def get_or_create_sync_status(self, ticker_id: int) -> SyncStatus:
        """Get or create sync status for a ticker"""
        sync_status = self.db.query(SyncStatus).filter(
            SyncStatus.ticker_id == ticker_id
        ).first()

        if not sync_status:
            sync_status = SyncStatus(ticker_id=ticker_id)
            self.db.add(sync_status)
            self.db.commit()
            self.db.refresh(sync_status)

        return sync_status

    def sync_ticker(self, ticker: Ticker, start_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Sync data for a single ticker

        Returns:
            Dict with sync results
        """
        sync_status = self.get_or_create_sync_status(ticker.id)

        try:
            # Update status to syncing
            sync_status.status = "syncing"
            sync_status.error_message = None
            self.db.commit()

            # Determine date range
            last_sync = self.get_last_sync_date(ticker.id)
            if last_sync:
                # Start from day after last sync
                start = (last_sync + timedelta(days=1)).strftime('%Y-%m-%d')
            elif start_date:
                start = start_date
            else:
                start = '2021-01-01'  # Default start date

            end = datetime.now().strftime('%Y-%m-%d')

            # Download data
            df = download_stock_data(ticker.symbol, start, end)

            if df is None or df.empty:
                sync_status.status = "completed"
                sync_status.last_sync_timestamp = datetime.now()
                self.db.commit()
                return {
                    "symbol": ticker.symbol,
                    "new_prices": 0,
                    "indicators_calculated": 0,
                    "message": "No new data available"
                }

            # Insert prices
            prices_added = self._insert_prices(ticker.id, df)

            # Calculate and insert indicators
            indicators_added = self._calculate_and_insert_indicators(ticker.id)

            # Update sync status
            sync_status.status = "completed"
            sync_status.last_sync_date = df['Date'].iloc[-1] if 'Date' in df.columns else None
            sync_status.last_sync_timestamp = datetime.now()
            self.db.commit()

            return {
                "symbol": ticker.symbol,
                "new_prices": prices_added,
                "indicators_calculated": indicators_added
            }

        except Exception as e:
            sync_status.status = "error"
            sync_status.error_message = str(e)
            sync_status.last_sync_timestamp = datetime.now()
            self.db.commit()
            raise

    def _insert_prices(self, ticker_id: int, df: pd.DataFrame) -> int:
        """Insert price data from DataFrame"""
        added = 0

        for _, row in df.iterrows():
            date_val = row['Date']

            # Check if price already exists
            existing = self.db.query(DailyPrice).filter(
                and_(
                    DailyPrice.ticker_id == ticker_id,
                    DailyPrice.date == date_val
                )
            ).first()

            if existing:
                continue

            price = DailyPrice(
                ticker_id=ticker_id,
                date=date_val,
                open=float(row['Open']) if pd.notna(row.get('Open')) else None,
                high=float(row['High']) if pd.notna(row.get('High')) else None,
                low=float(row['Low']) if pd.notna(row.get('Low')) else None,
                close=float(row['Close']),
                volume=int(row['Volume']) if pd.notna(row.get('Volume')) else None,
                adj_close=float(row.get('Adj Close', row['Close'])) if pd.notna(row.get('Adj Close', row['Close'])) else None
            )
            self.db.add(price)
            added += 1

        self.db.commit()
        return added

    def _calculate_and_insert_indicators(self, ticker_id: int) -> int:
        """Calculate all indicators and insert into database"""
        # Get all price data for this ticker
        prices = self.db.query(DailyPrice).filter(
            DailyPrice.ticker_id == ticker_id
        ).order_by(DailyPrice.date.asc()).all()

        if not prices:
            return 0

        # Convert to DataFrame for indicator calculation
        df = pd.DataFrame([{
            'date': p.date,
            'open': p.open,
            'high': p.high,
            'low': p.low,
            'close': p.close,
            'volume': p.volume
        } for p in prices])

        indicators_added = 0

        # Calculate Moving Averages (SMA and EMA)
        for period in self.MA_PERIODS:
            # SMA
            sma_indicator = IndicatorRegistry.get('sma')
            sma_indicator.period = period
            results = sma_indicator.calculate(df)
            indicators_added += self._save_indicator_results(
                ticker_id, 'sma', period, results
            )

            # EMA
            ema_indicator = IndicatorRegistry.get('ema')
            ema_indicator.period = period
            results = ema_indicator.calculate(df)
            indicators_added += self._save_indicator_results(
                ticker_id, 'ema', period, results
            )

        # Calculate MACD (standard: 12, 26, 9)
        macd_indicator = IndicatorRegistry.get('macd')
        results = macd_indicator.calculate(df)
        indicators_added += self._save_indicator_results(
            ticker_id, 'macd', None, results
        )

        # Calculate RSI (standard: 14)
        rsi_indicator = IndicatorRegistry.get('rsi')
        results = rsi_indicator.calculate(df)
        indicators_added += self._save_indicator_results(
            ticker_id, 'rsi', 14, results
        )

        # Calculate VWAP
        vwap_indicator = IndicatorRegistry.get('vwap')
        results = vwap_indicator.calculate(df)
        indicators_added += self._save_indicator_results(
            ticker_id, 'vwap', None, results
        )

        return indicators_added

    def _save_indicator_results(
        self,
        ticker_id: int,
        indicator_type: str,
        window_period: Optional[int],
        results: List[IndicatorResult]
    ) -> int:
        """Save indicator results to database"""
        added = 0

        for result in results:
            # Check if indicator already exists
            existing = self.db.query(TechnicalIndicator).filter(
                and_(
                    TechnicalIndicator.ticker_id == ticker_id,
                    TechnicalIndicator.date == result.date,
                    TechnicalIndicator.indicator_type == indicator_type,
                    TechnicalIndicator.window_period == window_period
                )
            ).first()

            if existing:
                # Update existing value
                existing.value = result.value
                if result.metadata:
                    existing.extra_data = result.metadata
            else:
                # Create new indicator
                indicator = TechnicalIndicator(
                    ticker_id=ticker_id,
                    date=result.date,
                    indicator_type=indicator_type,
                    window_period=window_period,
                    value=result.value,
                    extra_data=result.metadata
                )
                self.db.add(indicator)
                added += 1

        self.db.commit()
        return added