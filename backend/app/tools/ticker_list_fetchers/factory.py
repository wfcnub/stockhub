from typing import Dict, Type
from .base import TickerListFetcher
from .jci import JciTickerListFetcher


FETCHER_REGISTRY: Dict[str, Type[TickerListFetcher]] = {
    "JCI": JciTickerListFetcher,
}


def get_ticker_list_fetcher(index_code: str) -> TickerListFetcher:
    """
    Factory function to get the appropriate ticker list fetcher for an index.
    
    Args:
        index_code: The index code (e.g., "JCI")
        
    Returns:
        An instance of TickerListFetcher for the given index
        
    Raises:
        ValueError: If no fetcher is registered for the given index code
    """
    fetcher_cls = FETCHER_REGISTRY.get(index_code.upper())
    if not fetcher_cls:
        available = list(FETCHER_REGISTRY.keys())
        raise ValueError(
            f"No ticker list fetcher registered for index: {index_code}. "
            f"Available: {available}"
        )
    return fetcher_cls()


def register_fetcher(index_code: str, fetcher_cls: Type[TickerListFetcher]) -> None:
    """
    Register a new ticker list fetcher for an index.
    
    This allows adding custom fetchers for new indexes without modifying
    the factory code.
    
    Args:
        index_code: The index code to register (e.g., "JCI")
        fetcher_cls: The TickerListFetcher subclass to use for this index
    """
    FETCHER_REGISTRY[index_code.upper()] = fetcher_cls