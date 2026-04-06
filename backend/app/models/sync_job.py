from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class SyncJob(Base):
    """Model for tracking sync job progress"""
    __tablename__ = "sync_jobs"

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(100), unique=True, nullable=False, index=True)  # Unique job identifier
    index_id = Column(Integer, ForeignKey("indexes.id"), nullable=False, index=True)
    status = Column(String(20), default="pending", nullable=False)  # pending, running, completed, failed
    total_tickers = Column(Integer, default=0)
    processed_tickers = Column(Integer, default=0)
    current_ticker = Column(String(20))  # Symbol of currently processing ticker
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(String(500))

    # Relationships
    index = relationship("Index", back_populates="sync_jobs")

    def __repr__(self):
        return f"<SyncJob(sync_id={self.sync_id}, status={self.status})>"

    @property
    def progress_percent(self) -> float:
        """Calculate progress percentage"""
        if self.total_tickers == 0:
            return 0.0
        return round((self.processed_tickers / self.total_tickers) * 100, 1)