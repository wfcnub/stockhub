from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Index(Base):
    """Model for market indexes (e.g., IDX - Jakarta Composite Index)"""
    __tablename__ = "indexes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False)  # e.g., "IDX"
    name = Column(String(255), nullable=False)  # e.g., "Jakarta Composite Index"
    ticker_count = Column(Integer, default=0)  # Number of tickers in index
    is_active = Column(Boolean, default=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tickers = relationship("Ticker", back_populates="index")
    sync_jobs = relationship("SyncJob", back_populates="index")

    def __repr__(self):
        return f"<Index(code={self.code}, name={self.name})>"