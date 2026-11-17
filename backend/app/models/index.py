from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.sync_job import SyncJob
    from app.models.ticker import Ticker


class Index(Base):
    """Model for market indexes (e.g., JCI - Jakarta Composite Index)"""

    __tablename__ = "indexes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)  # e.g., "JCI"
    name: Mapped[str] = mapped_column(String(255))  # e.g., "Jakarta Composite Index"
    yfinance_suffix: Mapped[str] = mapped_column(
        String(10), default="", server_default=text("''")
    )  # e.g., ".JK" for IDX
    ticker_count: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Hard delete of an index removes its tickers and jobs (ON DELETE CASCADE in the DB).
    tickers: Mapped[list[Ticker]] = relationship(
        back_populates="index", cascade="all, delete-orphan", passive_deletes=True
    )
    sync_jobs: Mapped[list[SyncJob]] = relationship(
        back_populates="index", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Index(code={self.code}, name={self.name})>"
