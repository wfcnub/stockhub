from sqlalchemy import Column, Integer, BigInteger, String, Float, Date, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class DailyPrice(Base):
    __tablename__ = "prices"
    __table_args__ = (
        UniqueConstraint('ticker_id', 'date', name='uq_ticker_date'),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float, nullable=False)
    volume = Column(BigInteger)
    adj_close = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ticker = relationship("Ticker", back_populates="prices")

    def __repr__(self):
        return f"<DailyPrice(ticker_id={self.ticker_id}, date={self.date}, close={self.close})>"


class SyncStatus(Base):
    __tablename__ = "sync_status"

    id = Column(Integer, primary_key=True, index=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False, unique=True)
    last_sync_date = Column(Date)  # Last date of data synced
    last_sync_timestamp = Column(DateTime(timezone=True))
    status = Column(String(20), default="pending")  # pending, syncing, completed, error
    error_message = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    ticker = relationship("Ticker", back_populates="sync_status")

    def __repr__(self):
        return f"<SyncStatus(ticker_id={self.ticker_id}, status={self.status})>"