import re
from typing import List

from curl_cffi import requests


class JciTickerListFetcher:
    """Fetches ticker list from IDX (Jakarta Composite Index) via curl_cffi"""

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.url = "https://www.idx.co.id/id/data-pasar/data-saham/daftar-saham/"

    def fetch_tickers(self) -> List[str]:
        """
        Scrape ticker symbols from idx.co.id using curl_cffi.

        Returns:
            List of ticker symbols in uppercase without suffix

        Raises:
            RuntimeError: If scraping fails
        """
        try:
            resp = requests.get(self.url, impersonate="chrome", timeout=self.timeout)
            resp.raise_for_status()
            return self._extract_tickers_from_html(resp.text)
        except Exception as e:
            raise RuntimeError(f"Failed to scrape {self.url}: {e}") from e

    def _extract_tickers_from_html(self, html: str) -> List[str]:
        """Extract ticker symbols from NUXT-embedded stock data in HTML"""
        tickers: List[str] = []

        # Find the NUXT section containing stock data
        # Format: {Code:"BBCA",Name:"...",ListingDate:"...",Shares:..., ...}
        pattern = r'\{Code:"([A-Z]{2,5})"'
        matches = re.findall(pattern, html)

        seen = set()
        for symbol in matches:
            if symbol not in seen:
                seen.add(symbol)
                tickers.append(symbol)

        return tickers
