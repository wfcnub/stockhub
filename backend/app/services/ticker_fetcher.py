"""
Service for fetching ticker lists from various exchanges
"""
from typing import List, Optional

import yfinance as yf
from curl_cffi import requests

from app.config import EXCHANGE_CONFIG, settings


class TickerFetcher:
    """Fetches ticker lists from exchanges"""

    def __init__(self, exchange: str = "IDX"):
        self.exchange = exchange.upper()
        if self.exchange not in EXCHANGE_CONFIG:
            available = list(EXCHANGE_CONFIG.keys())
            raise ValueError(f"Unknown exchange: {exchange}. Available: {available}")

        self.config = EXCHANGE_CONFIG[self.exchange]
        self._ticker_cache: Optional[List[str]] = None

    def get_all_tickers(self) -> List[str]:
        """
        Get all tickers for the configured exchange.

        Returns:
            List of ticker symbols (without suffix)
        """
        if self._ticker_cache is not None:
            return self._ticker_cache

        self._ticker_cache = self._get_tickers_from_config()
        return self._ticker_cache

    def _get_tickers_from_config(self) -> List[str]:
        """Get tickers from the exchange config's ticker list."""
        tickers = self.config.get("tickers", "")
        if tickers:
            return [t.strip().upper() for t in tickers.split(",") if t.strip()]

        # Fall back to global fallback tickers
        fallback = settings.FALLBACK_TICKERS
        if fallback:
            return [t.strip().upper() for t in fallback.split(",") if t.strip()]
        return []

    def get_suffix(self) -> str:
        """Get the yfinance suffix for this exchange"""
        return self.config["suffix"]

    def get_ticker_with_suffix(self, symbol: str) -> str:
        """Get full ticker symbol with yfinance suffix"""
        return f"{symbol}{self.get_suffix()}"

    def validate_ticker(self, symbol: str) -> bool:
        """
        Validate if a ticker exists by attempting to fetch data.

        Args:
            symbol: Ticker symbol (without suffix)

        Returns:
            True if ticker exists and has data, False otherwise
        """
        try:
            session = requests.Session(impersonate="chrome123")
            full_symbol = self.get_ticker_with_suffix(symbol)
            ticker = yf.Ticker(full_symbol, session=session)

            # Try to get recent data
            data = ticker.history(period="5d")
            return not data.empty
        except Exception:
            return False

    def get_ticker_info(self, symbol: str) -> Optional[dict]:
        """
        Get ticker information from yfinance.

        Args:
            symbol: Ticker symbol (without suffix)

        Returns:
            Dict with ticker info or None if not found
        """
        try:
            session = requests.Session(impersonate="chrome123")
            full_symbol = self.get_ticker_with_suffix(symbol)
            ticker = yf.Ticker(full_symbol, session=session)
            info = ticker.info

            return {
                "symbol": symbol,
                "name": info.get("longName") or info.get("shortName") or symbol,
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "exchange": self.exchange,
            }
        except Exception:
            return {
                "symbol": symbol,
                "name": symbol,
                "sector": "Unknown",
                "industry": "Unknown",
                "exchange": self.exchange,
            }

    def get_exchange_info(self) -> dict:
        """
        Get information about the configured exchange.

        Returns:
            Dict with exchange details
        """
        return {
            "code": self.exchange,
            "name": self.config["name"],
            "suffix": self.config["suffix"],
            "source": self.config.get("source", "unknown"),
        }