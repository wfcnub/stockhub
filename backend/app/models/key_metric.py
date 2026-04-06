from sqlalchemy import Column, Integer, BigInteger, String, Float, Date, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class KeyMetric(Base):
    """Time-series fundamental metrics for tickers"""
    __tablename__ = "key_metrics"
    __table_args__ = (
        UniqueConstraint('ticker_id', 'observation_date', name='uq_ticker_observation'),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False, index=True)
    observation_date = Column(Date, nullable=False, index=True)
    market_cap = Column(BigInteger)
    pe_ratio = Column(Float)
    pbv = Column(Float)
    dividend_yield = Column(Float)
    eps = Column(Float)
    roe = Column(Float)
    fiscal_year = Column(Integer)
    fiscal_quarter = Column(Integer)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    ticker = relationship("Ticker", back_populates="key_metrics")

    def __repr__(self):
        return f"<KeyMetric(ticker_id={self.ticker_id}, date={self.observation_date})>"