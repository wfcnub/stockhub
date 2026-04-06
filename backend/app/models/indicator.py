from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class TechnicalIndicator(Base):
    __tablename__ = "technical_indicators"

    id = Column(Integer, primary_key=True, index=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    indicator_type = Column(String(30), nullable=False, index=True)  # e.g., 'sma', 'ema', 'rsi', 'macd_line', etc.
    window_period = Column(Integer, nullable=True)  # For MA: 5, 10, 15, 20, 50, 100, 200; For RSI: 14; For MACD: null
    value = Column(Float, nullable=False)
    extra_data = Column(String(500))  # JSON for additional data (MACD signal, histogram)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ticker = relationship("Ticker", back_populates="indicators")

    # Composite index for efficient queries
    __table_args__ = (
        Index('ix_ticker_indicator_date', 'ticker_id', 'indicator_type', 'date'),
    )

    def __repr__(self):
        return f"<TechnicalIndicator(ticker_id={self.ticker_id}, type={self.indicator_type}, date={self.date}, value={self.value})>"