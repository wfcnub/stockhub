# Copy of original helper.py - will be integrated into data_sync service
# Original location: /Users/hollowsyde/personal/wfcnub/stockhub/helper.py

import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime
from curl_cffi import requests


def download_stock_data(emiten: str, start_date: str = None, end_date: str = None) -> pd.DataFrame:
    """
    Downloads historical stock data from Yahoo Finance for a given emiten

    Args:
        emiten (str): The stock emiten symbol (e.g., 'BBCA')
        start_date (str): The start date for the data in 'YYYY-MM-DD' format
                          If empty, defaults to '2021-01-01'
        end_date (str): The end date for the data in 'YYYY-MM-DD' format
                        If empty, defaults to now

    Returns:
        pd.DataFrame: A DataFrame containing the cleaned historical stock data,
                      or None if the download fails
    """
    session = requests.Session(impersonate="chrome123")
    ticker = yf.Ticker(f"{emiten}.JK", session=session)

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