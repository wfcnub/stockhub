from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Ticker(Base):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(255))
    index_id = Column(Integer, ForeignKey("indexes.id"), nullable=False, index=True)
    sector = Column(String(100))
    industry = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    index = relationship("Index", back_populates="tickers")
    prices = relationship("DailyPrice", back_populates="ticker", cascade="all, delete-orphan")
    indicators = relationship("TechnicalIndicator", back_populates="ticker", cascade="all, delete-orphan")
    key_metrics = relationship("KeyMetric", back_populates="ticker", cascade="all, delete-orphan")
    sync_status = relationship("SyncStatus", back_populates="ticker", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Ticker(symbol={self.symbol})>"