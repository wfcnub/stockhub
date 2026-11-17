from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.ticker import Ticker


class TechnicalIndicator(Base):
    __tablename__ = "technical_indicators"

    # BIGINT: ON CONFLICT upserts consume sequence values even when they update.
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id", ondelete="CASCADE"))
    date: Mapped[dt.date] = mapped_column(Date)
    # e.g., 'sma', 'ema', 'rsi', 'macd_sma', 'macd_ema', 'vwap'
    indicator_type: Mapped[str] = mapped_column(String(30))
    # For MA: 5, 10, 15, 20, 50, 100, 200; for RSI: 14; for MACD/VWAP: NULL
    window_period: Mapped[int | None]
    value: Mapped[float]
    extra_data: Mapped[str | None] = mapped_column(String(500))  # JSON (MACD signal, histogram)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    ticker: Mapped[Ticker] = relationship(back_populates="indicators")

    __table_args__ = (
        # Natural key, ready for INSERT ... ON CONFLICT. NULLS NOT DISTINCT (PG 15+) so rows
        # with window_period NULL (MACD, VWAP) are deduplicated too.
        UniqueConstraint(
            "ticker_id",
            "indicator_type",
            "window_period",
            "date",
            name="uq_technical_indicators_natural_key",
            postgresql_nulls_not_distinct=True,
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<TechnicalIndicator(ticker_id={self.ticker_id}, type={self.indicator_type}, "
            f"date={self.date}, value={self.value})>"
        )
