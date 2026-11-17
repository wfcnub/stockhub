from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.ticker import Ticker


class KeyMetric(Base):
    """Time-series fundamental metrics for tickers"""

    __tablename__ = "key_metrics"
    __table_args__ = (UniqueConstraint("ticker_id", "observation_date"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id", ondelete="CASCADE"))
    observation_date: Mapped[dt.date] = mapped_column(Date)
    market_cap: Mapped[int | None] = mapped_column(BigInteger)
    pe_ratio: Mapped[float | None]
    pbv: Mapped[float | None]
    dividend_yield: Mapped[float | None]
    eps: Mapped[float | None]
    roe: Mapped[float | None]
    fiscal_year: Mapped[int | None]
    fiscal_quarter: Mapped[int | None]
    last_updated: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ticker: Mapped[Ticker] = relationship(back_populates="key_metrics")

    def __repr__(self) -> str:
        return f"<KeyMetric(ticker_id={self.ticker_id}, date={self.observation_date})>"
