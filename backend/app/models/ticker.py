from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.index import Index
    from app.models.indicator import TechnicalIndicator
    from app.models.key_metric import KeyMetric
    from app.models.price import DailyPrice, SyncStatus


class Ticker(Base):
    __tablename__ = "tickers"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str | None] = mapped_column(String(255))
    index_id: Mapped[int] = mapped_column(ForeignKey("indexes.id", ondelete="CASCADE"), index=True)
    sector: Mapped[str | None] = mapped_column(String(100))
    industry: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    index: Mapped[Index] = relationship(back_populates="tickers")
    prices: Mapped[list[DailyPrice]] = relationship(
        back_populates="ticker", cascade="all, delete-orphan", passive_deletes=True
    )
    indicators: Mapped[list[TechnicalIndicator]] = relationship(
        back_populates="ticker", cascade="all, delete-orphan", passive_deletes=True
    )
    key_metrics: Mapped[list[KeyMetric]] = relationship(
        back_populates="ticker", cascade="all, delete-orphan", passive_deletes=True
    )
    sync_status: Mapped[SyncStatus | None] = relationship(
        back_populates="ticker", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Ticker(symbol={self.symbol})>"
