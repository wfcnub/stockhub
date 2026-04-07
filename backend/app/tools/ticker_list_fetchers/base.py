from abc import ABC, abstractmethod
from typing import List


class TickerListFetcher(ABC):
    """Abstract base class for fetching ticker lists from various sources"""

    @abstractmethod
    def fetch_tickers(self) -> List[str]:
        """
        Fetch and return list of ticker symbols.
        
        Returns:
            List of ticker symbols in uppercase without suffix (e.g., "BBCA", "BBRI")
        """
        pass