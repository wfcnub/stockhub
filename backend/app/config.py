from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./stockhub.db"

    # CORS settings for frontend
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]

    # Data sync settings
    DEFAULT_START_DATE: str = "2021-01-01"

    # Moving average windows (as specified)
    MA_WINDOWS: List[int] = [5, 10, 15, 20, 50, 100, 200]

    # RSI period
    RSI_PERIOD: int = 14

    # MACD settings (standard)
    MACD_FAST: int = 12
    MACD_SLOW: int = 26
    MACD_SIGNAL: int = 9

    class Config:
        env_file = ".env"


settings = Settings()