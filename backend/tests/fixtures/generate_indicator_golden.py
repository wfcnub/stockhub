"""Regenerate tests/fixtures/indicator_golden.json from TA-Lib (dev dependency).

    cd backend && uv run python -m tests.fixtures.generate_indicator_golden

TA-Lib conventions captured here (default unstable period 0):
- SMA/EMA lookback n-1; EMA seeded with the SMA of the first n closes
- RSI lookback n (first value at bar n), Wilder smoothing, flat window -> 50
- MACD (EMA) lookback slow-1+signal-1 = 33; TA-Lib seeds the fast EMA at the slow EMA's
  first bar (bar 25), so its early values differ from the textbook EMA12-EMA26
- MACDEXT with matype 0 = SMA for all three averages
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import talib

from tests.reference.series import SERIES

OUT = Path(__file__).with_name("indicator_golden.json")
PERIODS = (5, 20, 200)


def _list(arr: np.ndarray) -> list[float | None]:
    return [None if math.isnan(v) else float(v) for v in arr]


def build() -> dict:
    data: dict = {"talib_version": talib.__version__, "series": {}}
    for name, closes in SERIES.items():
        a = np.asarray(closes, dtype=float)
        entry: dict = {"close": closes}
        for n in PERIODS:
            entry[f"sma_{n}"] = _list(talib.SMA(a, n))
            entry[f"ema_{n}"] = _list(talib.EMA(a, n))
        entry["rsi_14"] = _list(talib.RSI(a, 14))
        line, sig, hist = talib.MACD(a, 12, 26, 9)
        entry["macd_ema"] = {"line": _list(line), "signal": _list(sig), "hist": _list(hist)}
        line, sig, hist = talib.MACDEXT(a, 12, 0, 26, 0, 9, 0)
        entry["macd_sma"] = {"line": _list(line), "signal": _list(sig), "hist": _list(hist)}
        data["series"][name] = entry
    return data


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), indent=None, separators=(",", ":")) + "\n")
    print(f"wrote {OUT}")
