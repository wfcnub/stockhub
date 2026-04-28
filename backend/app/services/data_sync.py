"""
Data synchronization service for downloading and updating stock data
"""
import json
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.ticker import Ticker
from app.models.price import DailyPrice, SyncStatus
from app.models.indicator import TechnicalIndicator
from app.models.index import Index
from app.tools.ticker_list_fetchers import get_ticker_list_fetcher
from app.config import settings
from indicators.registry import IndicatorRegistry
from indicators.base import IndicatorResult
from app.tools.yfinance import download_stock_data
import pandas as pd


class DataSyncService:
    """Service for syncing stock data from Yahoo Finance"""

    # Moving average windows from config
    MA_PERIODS = settings.MA_WINDOWS
    MACD_LEGACY_TYPE = "macd"
    MACD_SMA_TYPE = "macd_sma"
    MACD_EMA_TYPE = "macd_ema"

    def __init__(self, db: Session):
        self.db = db

    def sync_index_ticker_list(self, index: Index) -> Dict[str, Any]:
        """
        Sync the ticker list for an index from the remote source.
        Adds new tickers, deactivates removed tickers, reactivates returned tickers.

        Args:
            index: The Index model instance

        Returns:
            Dict with sync results: added, deactivated, reactivated counts
        """
        fetcher = get_ticker_list_fetcher(index.code)
        remote_tickers = set(fetcher.fetch_tickers())

        # Get existing tickers for this index
        db_tickers = {
            t.symbol: t for t in
            self.db.query(Ticker).filter(Ticker.index_id == index.id).all()
        }
        db_symbols = set(db_tickers.keys())

        # New tickers to add (in remote but not in DB)
        new_symbols = remote_tickers - db_symbols

        # Tickers to deactivate (in DB but not in remote)
        removed_symbols = db_symbols - remote_tickers

        # Tickers to potentially reactivate (in both but inactive in DB)
        existing_symbols = db_symbols & remote_tickers

        added_count = 0
        for symbol in new_symbols:
            ticker = Ticker(
                symbol=symbol,
                index_id=index.id,
                is_active=True
            )
            self.db.add(ticker)
            added_count += 1

        deactivated_count = 0
        for symbol in removed_symbols:
            if db_tickers[symbol].is_active:
                db_tickers[symbol].is_active = False
                deactivated_count += 1

        reactivated_count = 0
        for symbol in existing_symbols:
            if not db_tickers[symbol].is_active:
                db_tickers[symbol].is_active = True
                reactivated_count += 1

        self.db.commit()

        return {
            "added": added_count,
            "deactivated": deactivated_count,
            "reactivated": reactivated_count,
            "total_remote": len(remote_tickers),
            "total_db": len(db_symbols),
        }

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

            # Get the ticker's index for yfinance suffix
            index = self.db.query(Index).filter(Index.id == ticker.index_id).first()
            suffix = index.yfinance_suffix if index and index.yfinance_suffix else ""

            # Determine date range
            last_sync = self.get_last_sync_date(ticker.id)
            if last_sync:
                # Start from day after last sync
                start = (last_sync + timedelta(days=1)).strftime('%Y-%m-%d')
            elif start_date:
                start = start_date
            else:
                start = '2021-01-01'  # Default start date

            end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=0).strftime('%Y-%m-%d %H:%M:%S')

            # Download data with the appropriate suffix
            df = download_stock_data(ticker.symbol, start, end, suffix=suffix)

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
            sma_indicator = IndicatorRegistry.get('sma', window=period)
            results = sma_indicator.calculate(df)
            indicators_added += self._save_indicator_results(
                ticker_id, 'sma', period, results
            )

            # EMA
            ema_indicator = IndicatorRegistry.get('ema', window=period)
            results = ema_indicator.calculate(df)
            indicators_added += self._save_indicator_results(
                ticker_id, 'ema', period, results
            )

        # Calculate MACD in both modes so chart endpoints can switch without recomputing.
        indicators_added += self._save_macd_for_dataframe(
            ticker_id=ticker_id,
            df=df,
            ma_type="sma",
            indicator_type=self.MACD_SMA_TYPE,
        )
        indicators_added += self._save_macd_for_dataframe(
            ticker_id=ticker_id,
            df=df,
            ma_type="ema",
            indicator_type=self.MACD_EMA_TYPE,
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

    def _save_macd_for_dataframe(
        self,
        ticker_id: int,
        df: pd.DataFrame,
        ma_type: str,
        indicator_type: str,
    ) -> int:
        """Calculate and store MACD values for a DataFrame in one MA mode."""
        macd_indicator = IndicatorRegistry.get('macd', ma_type=ma_type)
        results = macd_indicator.calculate(df)
        return self._save_indicator_results(
            ticker_id=ticker_id,
            indicator_type=indicator_type,
            window_period=None,
            results=results,
        )

    def migrate_macd_modes(self, index_id: Optional[int] = None, include_inactive: bool = False) -> Dict[str, Any]:
        """
        Migrate legacy MACD rows and backfill mode-specific MACD datasets.

        Steps:
        1. Rename legacy `macd` rows to `macd_ema`.
        2. Recalculate and upsert both `macd_ema` and `macd_sma` from price history.
        """
        ticker_query = self.db.query(Ticker)
        if index_id is not None:
            ticker_query = ticker_query.filter(Ticker.index_id == index_id)
        if not include_inactive:
            ticker_query = ticker_query.filter(Ticker.is_active == True)

        tickers = ticker_query.all()
        ticker_ids = [ticker.id for ticker in tickers]

        if not ticker_ids:
            return {
                "tickers_processed": 0,
                "legacy_rows_migrated": 0,
                "macd_sma_added": 0,
                "macd_ema_added": 0,
                "message": "No tickers matched migration filter",
            }

        legacy_rows = self.db.query(TechnicalIndicator).filter(
            TechnicalIndicator.ticker_id.in_(ticker_ids),
            TechnicalIndicator.indicator_type == self.MACD_LEGACY_TYPE,
        ).all()

        legacy_rows_migrated = 0
        duplicate_legacy_rows_removed = 0
        for row in legacy_rows:
            existing_ema = self.db.query(TechnicalIndicator).filter(
                and_(
                    TechnicalIndicator.ticker_id == row.ticker_id,
                    TechnicalIndicator.date == row.date,
                    TechnicalIndicator.indicator_type == self.MACD_EMA_TYPE,
                    TechnicalIndicator.window_period == row.window_period,
                )
            ).first()

            if existing_ema:
                if not existing_ema.extra_data and row.extra_data:
                    existing_ema.extra_data = row.extra_data
                self.db.delete(row)
                duplicate_legacy_rows_removed += 1
                continue

            row.indicator_type = self.MACD_EMA_TYPE
            legacy_rows_migrated += 1

        self.db.commit()

        macd_sma_added = 0
        macd_ema_added = 0
        tickers_processed = 0

        for ticker in tickers:
            prices = self.db.query(DailyPrice).filter(
                DailyPrice.ticker_id == ticker.id
            ).order_by(DailyPrice.date.asc()).all()

            if not prices:
                continue

            df = pd.DataFrame([{
                'date': p.date,
                'open': p.open,
                'high': p.high,
                'low': p.low,
                'close': p.close,
                'volume': p.volume,
            } for p in prices])

            macd_ema_added += self._save_macd_for_dataframe(
                ticker_id=ticker.id,
                df=df,
                ma_type="ema",
                indicator_type=self.MACD_EMA_TYPE,
            )
            macd_sma_added += self._save_macd_for_dataframe(
                ticker_id=ticker.id,
                df=df,
                ma_type="sma",
                indicator_type=self.MACD_SMA_TYPE,
            )
            tickers_processed += 1

        return {
            "tickers_processed": tickers_processed,
            "legacy_rows_migrated": legacy_rows_migrated,
            "duplicate_legacy_rows_removed": duplicate_legacy_rows_removed,
            "macd_sma_added": macd_sma_added,
            "macd_ema_added": macd_ema_added,
            "message": "MACD mode migration completed",
        }

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
                existing.value = result.value
                if result.metadata:
                    existing.extra_data = json.dumps(result.metadata)
            else:
                indicator = TechnicalIndicator(
                    ticker_id=ticker_id,
                    date=result.date,
                    indicator_type=indicator_type,
                    window_period=window_period,
                    value=result.value,
                    extra_data=json.dumps(result.metadata) if result.metadata else None
                )
                self.db.add(indicator)
                added += 1

        self.db.commit()
        return added