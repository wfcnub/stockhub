from typing import Dict, List, Type, Optional
from .base import BaseIndicator


class IndicatorRegistry:
    """
    Registry for all technical indicators.

    Allows dynamic registration and retrieval of indicators by name.
    New indicators can be added by decorating with @register_indicator.
    """

    _indicators: Dict[str, Type[BaseIndicator]] = {}

    @classmethod
    def register(cls, indicator_class: Type[BaseIndicator]) -> Type[BaseIndicator]:
        """
        Register an indicator class.

        Args:
            indicator_class: The indicator class to register

        Returns:
            The registered class (allows use as decorator)
        """
        cls._indicators[indicator_class.name] = indicator_class
        return indicator_class

    @classmethod
    def get(cls, name: str, **params) -> Optional[BaseIndicator]:
        """
        Get an instance of an indicator by name.

        Args:
            name: The indicator name (e.g., 'sma', 'rsi')
            **params: Parameters to pass to the indicator constructor

        Returns:
            Instance of the indicator, or None if not found
        """
        indicator_class = cls._indicators.get(name)
        if indicator_class:
            return indicator_class(**params)
        return None

    @classmethod
    def list_all(cls) -> List[str]:
        """
        List all registered indicator names.

        Returns:
            List of indicator names
        """
        return list(cls._indicators.keys())

    @classmethod
    def get_class(cls, name: str) -> Optional[Type[BaseIndicator]]:
        """
        Get the indicator class by name (without instantiation).

        Args:
            name: The indicator name

        Returns:
            The indicator class, or None if not found
        """
        return cls._indicators.get(name)


def register_indicator(cls: Type[BaseIndicator]) -> Type[BaseIndicator]:
    """
    Decorator to register an indicator class.

    Usage:
        @register_indicator
        class MyIndicator(BaseIndicator):
            name = "my_indicator"
            ...
    """
    return IndicatorRegistry.register(cls)