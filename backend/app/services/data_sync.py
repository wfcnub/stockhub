"""
Data synchronization service for downloading and updating stock data.

Writes are set-based: prices and indicators are upserted with INSERT ... ON CONFLICT on their
natural keys, and rows whose values did not change are left alone (no N+1 queries).
"""

import json
import logging
from collections.abc import Callable, Iterable
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models.index import Index
from app.models.indicator import TechnicalIndicator
from app.models.price import DailyPrice, SyncStatus
from app.models.ticker import Ticker
from app.sync.market_time import drop_unfinished_bars, now_wib
from app.tools.ticker_list_fetchers import get_ticker_list_fetcher
from app.tools.yfinance import download_stock_data
from indicators.base import BaseIndicator, IndicatorResult
from indicators.registry import IndicatorRegistry

logger = logging.getLogger(__name__)

# (symbol, start, end, suffix) -> DataFrame with Date/Open/High/Low/Close/Volume columns
FetchBars = Callable[[str, str, str, str], Optional[pd.DataFrame]]
# index code -> ticker symbols without suffix
FetchTickerList = Callable[[str], Iterable[str]]

PRICE_COLUMNS = ("open", "high", "low", "close", "volume", "adj_close")
UPSERT_CHUNK = 2000  # rows per statement; well below PostgreSQL's 65535 bind-parameter limit
ERROR_MESSAGE_MAX = 500


def _indicator(name: str, **params: Any) -> BaseIndicator:
    indicator = IndicatorRegistry.get(name, **params)
    if indicator is None:
        raise LookupError(f"indicator {name!r} is not registered")
    return indicator


def _default_fetch_ticker_list(index_code: str) -> Iterable[str]:
    return get_ticker_list_fetcher(index_code).fetch_tickers()


def _float_or_none(value: Any) -> Optional[float]:
    return float(value) if pd.notna(value) else None


def _chunks(rows: List[Dict[str, Any]], size: int = UPSERT_CHUNK) -> Iterable[List[Dict[str, Any]]]:
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


class DataSyncService:
    """Service for syncing stock data (default source: Yahoo Finance via yfinance)."""

    # Moving average windows from config
    MA_PERIODS = settings.MA_WINDOWS
    MACD_LEGACY_TYPE = "macd"
    MACD_SMA_TYPE = "macd_sma"
    MACD_EMA_TYPE = "macd_ema"

    def __init__(
        self,
        db: Session,
        fetch_bars: Optional[FetchBars] = None,
        fetch_ticker_list: Optional[FetchTickerList] = None,
        now: Optional[Callable[[], datetime]] = None,
    ):
        self.db = db
        self.fetch_bars = fetch_bars or download_stock_data
        self.fetch_ticker_list = fetch_ticker_list or _default_fetch_ticker_list
        self.now = now or now_wib

    def sync_index_ticker_list(self, index: Index) -> Dict[str, Any]:
        """
        Sync the ticker list for an index from the remote source.
        Adds new tickers, deactivates removed tickers, reactivates returned tickers.
        """
        remote_tickers = set(self.fetch_ticker_list(index.code))

        db_tickers = {
            t.symbol: t for t in self.db.query(Ticker).filter(Ticker.index_id == index.id).all()
        }
        db_symbols = set(db_tickers.keys())

        new_symbols = remote_tickers - db_symbols
        removed_symbols = db_symbols - remote_tickers
        existing_symbols = db_symbols & remote_tickers

        for symbol in new_symbols:
            self.db.add(Ticker(symbol=symbol, index_id=index.id, is_active=True))

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
            "added": len(new_symbols),
            "deactivated": deactivated_count,
            "reactivated": reactivated_count,
            "total_remote": len(remote_tickers),
            "total_db": len(db_symbols),
        }

    def get_last_sync_date(self, ticker_id: int) -> Optional[date]:
        """Get the last date for which we have price data"""
        return self.db.scalar(
            select(func.max(DailyPrice.date)).where(DailyPrice.ticker_id == ticker_id)
        )

    def get_or_create_sync_status(self, ticker_id: int) -> SyncStatus:
        """Get or create sync status for a ticker"""
        sync_status = self.db.query(SyncStatus).filter(SyncStatus.ticker_id == ticker_id).first()
        if not sync_status:
            sync_status = SyncStatus(ticker_id=ticker_id)
            self.db.add(sync_status)
            self.db.commit()
            self.db.refresh(sync_status)
        return sync_status

    def sync_ticker(
        self,
        ticker: Ticker,
        start_date: Optional[str] = None,
        full_recompute: bool = False,
    ) -> Dict[str, Any]:
        """
        Sync one ticker: download bars, upsert prices, recompute and upsert indicators.

        - Re-fetches SYNC_REFETCH_DAYS before the last stored bar so revisions are picked up.
        - Never stores today's bar before the IDX close (see app.sync.market_time).
        - Indicators are recomputed on the full history but only rows from the earliest changed
          price date onward are written (all rows when full_recompute=True).
        On failure the error is recorded in sync_status and the exception is re-raised.
        """
        ticker_id, symbol = ticker.id, ticker.symbol
        sync_status = self.get_or_create_sync_status(ticker_id)
        try:
            sync_status.status = "syncing"
            sync_status.error_message = None
            self.db.commit()

            index = self.db.get(Index, ticker.index_id)
            suffix = index.yfinance_suffix if index and index.yfinance_suffix else ""

            now = self.now()
            last_stored = self.get_last_sync_date(ticker_id)
            if last_stored:
                start = (last_stored - timedelta(days=settings.SYNC_REFETCH_DAYS)).isoformat()
            elif start_date:
                start = start_date
            else:
                start = settings.DEFAULT_START_DATE
            end = f"{now.date().isoformat()} 23:59:59"

            df = self.fetch_bars(symbol, start, end, suffix)
            if df is not None and not df.empty:
                df = drop_unfinished_bars(df, now)

            prices_written = 0
            indicators_written = 0
            if df is not None and not df.empty:
                prices_written, earliest_changed = self._upsert_prices(ticker_id, df)
                if full_recompute or last_stored is None:
                    since = None
                else:
                    since = earliest_changed
                if full_recompute or earliest_changed is not None:
                    indicators_written = self._calculate_and_upsert_indicators(ticker_id, since)

            sync_status.status = "completed"
            sync_status.last_sync_date = self.get_last_sync_date(ticker_id)
            sync_status.last_sync_timestamp = datetime.now(timezone.utc)
            self.db.commit()

            result: Dict[str, Any] = {
                "symbol": symbol,
                "new_prices": prices_written,
                "indicators_calculated": indicators_written,
            }
            if prices_written == 0:
                result["message"] = "No new data available"
            return result

        except Exception as exc:
            self.db.rollback()
            self.record_ticker_error(ticker_id, exc)
            raise

    def record_ticker_error(self, ticker_id: int, exc: BaseException) -> None:
        """Persist a per-ticker failure in sync_status (best effort, own transaction)."""
        message = f"{type(exc).__name__}: {exc}"[:ERROR_MESSAGE_MAX]
        try:
            status = self.db.query(SyncStatus).filter(SyncStatus.ticker_id == ticker_id).first()
            if status is None:
                status = SyncStatus(ticker_id=ticker_id)
                self.db.add(status)
            status.status = "error"
            status.error_message = message
            status.last_sync_timestamp = datetime.now(timezone.utc)
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Could not record sync error for ticker_id=%s", ticker_id)

    def _upsert_prices(self, ticker_id: int, df: pd.DataFrame) -> tuple[int, Optional[date]]:
        """Upsert bars; return (rows inserted or changed, earliest such date)."""
        rows: List[Dict[str, Any]] = []
        for record in df.to_dict("records"):
            close = record.get("Close")
            if pd.isna(close):
                continue  # a bar without a close is unusable; leave it for a later run
            volume = record.get("Volume")
            adj_close = record.get("Adj Close", close)
            rows.append(
                {
                    "ticker_id": ticker_id,
                    "date": record["Date"],
                    "open": _float_or_none(record.get("Open")),
                    "high": _float_or_none(record.get("High")),
                    "low": _float_or_none(record.get("Low")),
                    "close": float(close),
                    "volume": int(volume) if pd.notna(volume) else None,
                    "adj_close": _float_or_none(adj_close),
                }
            )

        # One row per date: a multi-row ON CONFLICT DO UPDATE may not touch the same key twice,
        # and the source occasionally repeats a date. The last occurrence wins.
        rows = list({row["date"]: row for row in rows}.values())

        changed_dates: List[date] = []
        table = DailyPrice.__table__
        for chunk in _chunks(rows):
            stmt = insert(DailyPrice).values(chunk)
            upsert = stmt.on_conflict_do_update(
                constraint="uq_prices_ticker_id_date",
                set_={col: stmt.excluded[col] for col in PRICE_COLUMNS},
                where=or_(
                    *(table.c[col].is_distinct_from(stmt.excluded[col]) for col in PRICE_COLUMNS)
                ),
            ).returning(table.c.date)
            changed_dates.extend(self.db.scalars(upsert).all())
        self.db.commit()
        return len(changed_dates), (min(changed_dates) if changed_dates else None)

    def _calculate_and_upsert_indicators(self, ticker_id: int, since: Optional[date] = None) -> int:
        """Recompute all indicators on the full price history; upsert rows from `since` on."""
        prices = (
            self.db.query(DailyPrice)
            .filter(DailyPrice.ticker_id == ticker_id)
            .order_by(DailyPrice.date.asc())
            .all()
        )
        if not prices:
            return 0

        df = pd.DataFrame(
            [
                {
                    "date": p.date,
                    "open": p.open,
                    "high": p.high,
                    "low": p.low,
                    "close": p.close,
                    "volume": p.volume,
                }
                for p in prices
            ]
        )

        written = 0
        for period in self.MA_PERIODS:
            results = _indicator("sma", window=period).calculate(df)
            written += self._save_indicator_results(ticker_id, "sma", period, results, since)
            results = _indicator("ema", window=period).calculate(df)
            written += self._save_indicator_results(ticker_id, "ema", period, results, since)

        # MACD in both modes so chart endpoints can switch without recomputing.
        for ma_type, indicator_type in (("sma", self.MACD_SMA_TYPE), ("ema", self.MACD_EMA_TYPE)):
            results = _indicator("macd", ma_type=ma_type).calculate(df)
            written += self._save_indicator_results(ticker_id, indicator_type, None, results, since)

        results = _indicator("rsi").calculate(df)
        written += self._save_indicator_results(ticker_id, "rsi", 14, results, since)

        results = _indicator("vwap").calculate(df)
        written += self._save_indicator_results(ticker_id, "vwap", None, results, since)

        return written

    def _save_macd_for_dataframe(
        self,
        ticker_id: int,
        df: pd.DataFrame,
        ma_type: str,
        indicator_type: str,
    ) -> int:
        """Calculate and store MACD values for a DataFrame in one MA mode."""
        macd_indicator = _indicator("macd", ma_type=ma_type)
        results = macd_indicator.calculate(df)
        return self._save_indicator_results(
            ticker_id=ticker_id,
            indicator_type=indicator_type,
            window_period=None,
            results=results,
        )

    def migrate_macd_modes(
        self, index_id: Optional[int] = None, include_inactive: bool = False
    ) -> Dict[str, Any]:
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

        legacy_rows = (
            self.db.query(TechnicalIndicator)
            .filter(
                TechnicalIndicator.ticker_id.in_(ticker_ids),
                TechnicalIndicator.indicator_type == self.MACD_LEGACY_TYPE,
            )
            .all()
        )

        legacy_rows_migrated = 0
        duplicate_legacy_rows_removed = 0
        for row in legacy_rows:
            existing_ema = (
                self.db.query(TechnicalIndicator)
                .filter(
                    and_(
                        TechnicalIndicator.ticker_id == row.ticker_id,
                        TechnicalIndicator.date == row.date,
                        TechnicalIndicator.indicator_type == self.MACD_EMA_TYPE,
                        TechnicalIndicator.window_period == row.window_period,
                    )
                )
                .first()
            )

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
            prices = (
                self.db.query(DailyPrice)
                .filter(DailyPrice.ticker_id == ticker.id)
                .order_by(DailyPrice.date.asc())
                .all()
            )

            if not prices:
                continue

            df = pd.DataFrame(
                [
                    {
                        "date": p.date,
                        "open": p.open,
                        "high": p.high,
                        "low": p.low,
                        "close": p.close,
                        "volume": p.volume,
                    }
                    for p in prices
                ]
            )

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
        results: List[IndicatorResult],
        since: Optional[date] = None,
    ) -> int:
        """Upsert indicator values on the natural key; return rows inserted or changed."""
        rows = [
            {
                "ticker_id": ticker_id,
                "date": r.date,
                "indicator_type": indicator_type,
                "window_period": window_period,
                "value": r.value,
                "extra_data": json.dumps(r.metadata) if r.metadata else None,
            }
            for r in results
            if since is None or r.date >= since
        ]
        table = TechnicalIndicator.__table__
        written = 0
        for chunk in _chunks(rows):
            stmt = insert(TechnicalIndicator).values(chunk)
            upsert = stmt.on_conflict_do_update(
                constraint="uq_technical_indicators_natural_key",
                set_={"value": stmt.excluded.value, "extra_data": stmt.excluded.extra_data},
                where=or_(
                    table.c.value.is_distinct_from(stmt.excluded.value),
                    table.c.extra_data.is_distinct_from(stmt.excluded.extra_data),
                ),
            ).returning(table.c.id)
            written += len(self.db.scalars(upsert).all())
        self.db.commit()
        return written
