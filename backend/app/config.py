from pydantic_settings import BaseSettings
from typing import List, Dict, Any


# Exchange configurations - defines how to fetch tickers for each exchange
EXCHANGE_CONFIG: Dict[str, Dict[str, Any]] = {
    "IDX": {
        "name": "Jakarta Composite Index",
        "suffix": ".JK",  # yfinance suffix
    },
    # Future exchanges can be added here:
    # "NYSE": {
    #     "name": "New York Stock Exchange",
    #     "suffix": "",
    # },
}


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

    # Active indexes/exchanges to show in the web app
    # Comma-separated list of exchange codes
    ACTIVE_EXCHANGES: str = "IDX"

    # Ticker lists per exchange (comma-separated)
    # Used as the source of truth for available tickers
    FALLBACK_TICKERS: str = (
        "BBCA,BBRI,BMRI,BBNI,BBTN,ARTO,BNII,MEGA,BBYB,BNGA,BNBA,BACA,BCIC,NISP,OCBC,"
        "PANR,PDDD,SMDM,TLKM,EXCL,ISAT,FREN,EMTK,MNCN,ADRO,ANTM,PTBA,INCO,MDKA,SMMT,"
        "BORN,BRMS,BYAN,HRUM,INPS,KKGI,MBAP,PSAB,SAHM,SBIJ,SSIA,TOBA,ICBP,INDF,MYOR,"
        "UNVR,AMRT,ACES,CIPS,DLTA,DVLA,HOKI,IKEA,INDX,KINO,KBLI,LMAS,MLBI,ROCK,SKBM,"
        "SKLT,STAA,TAMU,TEBE,ULTG,WAPO,WIIM,ASRI,BSDE,CTRA,PWON,APLN,DILD,GAMA,GPRA,"
        "GWSA,JMTR,KPKI,LAMS,LPKR,MDLN,METR,MKNT,MTSM,NIRO,PPRE,RODA,SCBD,SMRA,SONA,"
        "SRAI,SSIA,TKSH,TRUS,JSMR,WTON,ADHI,INTP,PTPP,SMGR,WIKA,JKON,KRAS,MARG,PANI,"
        "PDPP,PTDU,RTIX,TBIG,TKIM,PGAS,MEDC,ESSA,AKRA,ELSA,ENRG,JZSE,KOPI,META,MTRA,"
        "NRCA,PNBN,RIGS,SIPD,GOTO,BUKA,DCII,DEAL,DMAS,EDGE,FAMO,GEMI,HURR,IDEA,JALA,"
        "KLIX,LION,MCAS,MICE,MVLA,NLFL,ORIN,PACE,PLAY,PORA,RAZR,SURE,TECH,TRMA,UCOK,"
        "VIRA,VRNA,WOMI,YONG,ZNNN,ASII,AUTO,DRMA,IMAS,INJT,JSPT,MFMA,MSIN,AALI,ANJT,"
        "BAPA,BWPT,DSSA,GZCO,JAPI,LSIP,MMLP,PALM,PNBN,PUDP,SIMP,SMSM,SQBB,TBLA,UNSP,"
        "WILP,WING,DGIC,DVLA,INAF,KLBF,MERK,PYFA,SCCO,SDRA,TACO"
    )

    class Config:
        env_file = ".env"

    def get_active_exchanges(self) -> List[str]:
        """Get list of active exchange codes"""
        exchanges = [e.strip().upper() for e in self.ACTIVE_EXCHANGES.split(",")]
        # Validate that all exchanges exist in config
        invalid = [e for e in exchanges if e not in EXCHANGE_CONFIG]
        if invalid:
            raise ValueError(f"Unknown exchanges: {invalid}. Available: {list(EXCHANGE_CONFIG.keys())}")
        return exchanges


settings = Settings()