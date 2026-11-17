from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.index import Index

# "running" is a legacy value the API maps to "in_progress".
SYNC_JOB_STATUS_VALUES = ("pending", "in_progress", "running", "completed", "failed", "cancelled")


class SyncJob(Base):
    """Model for tracking sync job progress"""

    __tablename__ = "sync_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    sync_id: Mapped[str] = mapped_column(String(100), unique=True)  # Unique job identifier
    index_id: Mapped[int] = mapped_column(ForeignKey("indexes.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default=text("'pending'"), index=True
    )
    total_tickers: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    processed_tickers: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    failed_tickers: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    current_ticker: Mapped[str | None] = mapped_column(String(20))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(String(500))

    index: Mapped[Index] = relationship(back_populates="sync_jobs")

    __table_args__ = (
        CheckConstraint(
            "status IN (" + ", ".join(f"'{v}'" for v in SYNC_JOB_STATUS_VALUES) + ")",
            name="status_valid",
        ),
    )

    def __repr__(self) -> str:
        return f"<SyncJob(sync_id={self.sync_id}, status={self.status})>"

    @property
    def progress_percent(self) -> float:
        """Calculate progress percentage"""
        if self.total_tickers == 0:
            return 0.0
        return round((self.processed_tickers / self.total_tickers) * 100, 1)
