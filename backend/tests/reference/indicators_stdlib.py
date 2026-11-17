"""Plain-Python reference indicators written straight from the canonical definitions.

No numpy/pandas, so they share no code with backend/indicators or TA-Lib. NaN marks bars
without a value (warm-up). Sources:
- SMA: arithmetic mean of the last n closes.
- EMA: k = 2/(n+1); seeded with the SMA of the first n values (StockCharts ChartSchool;
  TA-Lib docs: https://ta-lib.org/functions/ema).
- RSI: Wilder (1978), New Concepts in Technical Trading Systems. Average gain/loss are seeded
  with the simple mean of the first n changes; the first RSI uses that seed; afterwards
  avg = (prev * (n - 1) + current) / n (Wilder smoothing; StockCharts ChartSchool RSI).
  A window with neither gains nor losses gives 50 (TA-Lib's convention; Wilder leaves it
  undefined).
- MACD (Appel): EMA(fast) - EMA(slow), signal = EMA(signal) of the MACD line, histogram =
  MACD - signal. The SMA variant uses SMAs instead.
"""

from __future__ import annotations

import math

NaN = float("nan")


def sma(values: list[float], n: int) -> list[float]:
    out = [NaN] * len(values)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1 : i + 1]
        if any(math.isnan(v) for v in window):
            continue
        out[i] = sum(window) / n
    return out


def ema(values: list[float], n: int) -> list[float]:
    """EMA seeded with the SMA of the first n non-NaN values (leading NaNs are skipped)."""
    out = [NaN] * len(values)
    start = next((i for i, v in enumerate(values) if not math.isnan(v)), None)
    if start is None or len(values) - start < n:
        return out
    k = 2.0 / (n + 1)
    seed_idx = start + n - 1
    prev = sum(values[start : seed_idx + 1]) / n
    out[seed_idx] = prev
    for i in range(seed_idx + 1, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(closes: list[float], n: int = 14) -> list[float]:
    out = [NaN] * len(closes)
    if len(closes) <= n:
        return out
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(c, 0.0) for c in changes]
    losses = [max(-c, 0.0) for c in changes]

    def value(avg_gain: float, avg_loss: float) -> float:
        if avg_loss == 0:
            return 100.0 if avg_gain > 0 else 50.0  # flat window: neutral (TA-Lib convention)
        return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)

    avg_gain = sum(gains[:n]) / n
    avg_loss = sum(losses[:n]) / n
    out[n] = value(avg_gain, avg_loss)  # first RSI on the seed, at bar n
    for i in range(n + 1, len(closes)):
        avg_gain = (avg_gain * (n - 1) + gains[i - 1]) / n
        avg_loss = (avg_loss * (n - 1) + losses[i - 1]) / n
        out[i] = value(avg_gain, avg_loss)
    return out


def macd(
    closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9, ma: str = "ema"
) -> tuple[list[float], list[float], list[float]]:
    avg = ema if ma == "ema" else sma
    f, s = avg(closes, fast), avg(closes, slow)
    line = [a - b if not (math.isnan(a) or math.isnan(b)) else NaN for a, b in zip(f, s)]
    sig = avg(line, signal)
    hist = [a - b if not (math.isnan(a) or math.isnan(b)) else NaN for a, b in zip(line, sig)]
    return line, sig, hist
