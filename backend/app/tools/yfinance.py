"""
Yahoo Finance tools for downloading stock data
"""

import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime
from curl_cffi import requests


def download_stock_data(
    symbol: str,
    start_date: str = None,
    end_date: str = None,
    suffix: str = ""
) -> pd.DataFrame:
    """
    Downloads historical stock data from Yahoo Finance for a given symbol

    Args:
        symbol (str): The stock symbol (e.g., 'BBCA')
        start_date (str): The start date for the data in 'YYYY-MM-DD' format
                          If empty, defaults to '2021-01-01'
        end_date (str): The end date for the data in 'YYYY-MM-DD' format
                        If empty, defaults to now
        suffix (str): The yfinance suffix for the exchange (e.g., '.JK' for IDX)
                      Default is empty string (no suffix)

    Returns:
        pd.DataFrame: A DataFrame containing the cleaned historical stock data,
                      or None if the download fails
    """
    session = requests.Session(impersonate="chrome123")
    full_symbol = f"{symbol}{suffix}" if suffix else symbol
    ticker = yf.Ticker(full_symbol, session=session)

    start = datetime.strptime(start_date, '%Y-%m-%d') if start_date else datetime.strptime('2021-01-01', '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d') if end_date else datetime.now()
    data = ticker.history(start=start, end=end)

    columns_to_drop = ['Dividends', 'Stock Splits', 'Capital Gains']
    for col in columns_to_drop:
        if col in data.columns:
            data.drop(columns=[col], inplace=True)

    data.reset_index(inplace=True)

    try:
        data['Date'] = data['Date'].dt.date
    except:
        pass

    return data