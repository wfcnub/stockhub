from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.ticker import Ticker

SYNC_STATUS_VALUES = ("pending", "syncing", "completed", "error")


class DailyPrice(Base):
    __tablename__ = "prices"

    # BIGINT: ON CONFLICT upserts consume sequence values even when they update.
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Natural key (ticker_id, date); its unique index also serves ticker_id lookups.
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id", ondelete="CASCADE"))
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    open: Mapped[float | None]
    high: Mapped[float | None]
    low: Mapped[float | None]
    close: Mapped[float]
    volume: Mapped[int | None] = mapped_column(BigInteger)
    adj_close: Mapped[float | None]
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    ticker: Mapped[Ticker] = relationship(back_populates="prices")

    __table_args__ = (UniqueConstraint("ticker_id", "date"),)

    def __repr__(self) -> str:
        return f"<DailyPrice(ticker_id={self.ticker_id}, date={self.date}, close={self.close})>"


class SyncStatus(Base):
    __tablename__ = "sync_status"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker_id: Mapped[int] = mapped_column(
        ForeignKey("tickers.id", ondelete="CASCADE"), unique=True
    )
    last_sync_date: Mapped[dt.date | None] = mapped_column(Date)  # Last date of data synced
    last_sync_timestamp: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default=text("'pending'")
    )
    error_message: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    ticker: Mapped[Ticker] = relationship(back_populates="sync_status")

    __table_args__ = (
        CheckConstraint(
            "status IN (" + ", ".join(f"'{v}'" for v in SYNC_STATUS_VALUES) + ")",
            name="status_valid",
        ),
    )

    def __repr__(self) -> str:
        return f"<SyncStatus(ticker_id={self.ticker_id}, status={self.status})>"
