"""Golden-vector tests for backend/indicators.

Three independent checks per indicator:
1. against TA-Lib 0.8.3 outputs committed in tests/fixtures/indicator_golden.json
   (regenerate with `uv run python -m tests.fixtures.generate_indicator_golden`);
2. against the plain-Python reference in tests/reference/indicators_stdlib.py;
3. against small hand-computed vectors (exact fractions, derivation in comments).
No database needed.
"""

from __future__ import annotations

import json
import math
from datetime import date, timedelta
from fractions import Fraction
from pathlib import Path

import pandas as pd
import pytest

from indicators import EMA, MACD, RSI, SMA, VWAP
from tests.reference import indicators_stdlib as ref
from tests.reference.series import SERIES

GOLDEN = json.loads((Path(__file__).parent / "fixtures" / "indicator_golden.json").read_text())
REL = 1e-9
ABS = 1e-9
MACD_TALIB_CONVERGED_FROM = 200  # bars; see test_talib_macd_seeding_explains_early_difference


def frame(closes: list[float]) -> pd.DataFrame:
    d0 = date(2021, 1, 4)
    return pd.DataFrame(
        {
            "date": [d0 + timedelta(days=i) for i in range(len(closes))],
            "open": closes,
            "high": [c * 1.01 for c in closes],
            "low": [c * 0.99 for c in closes],
            "close": closes,
            "volume": [1_000 + i for i in range(len(closes))],
        }
    )


def aligned(results, n: int, field: str | None = None) -> list[float | None]:
    """Indicator results -> list aligned to bar index (None where no value)."""
    d0 = date(2021, 1, 4)
    out: list[float | None] = [None] * n
    for r in results:
        i = (r.date - d0).days
        out[i] = r.value if field is None else r.metadata[field]
    return out


def as_none(values: list[float]) -> list[float | None]:
    return [None if (v is None or math.isnan(v)) else v for v in values]


def assert_series_equal(actual, expected, start: int = 0, label: str = "") -> None:
    assert len(actual) == len(expected), label
    for i in range(start, len(expected)):
        a, e = actual[i], expected[i]
        if e is None or a is None:
            assert a is None and e is None, f"{label} bar {i}: {a!r} vs {e!r} (warm-up mismatch)"
        else:
            assert a == pytest.approx(e, rel=REL, abs=ABS), f"{label} bar {i}: {a} vs {e}"


SERIES_NAMES = list(SERIES)


# --- 0. fixture integrity -------------------------------------------------------------------


def test_fixture_matches_live_talib() -> None:
    pytest.importorskip("talib")
    from tests.fixtures.generate_indicator_golden import build

    live = build()
    assert live["talib_version"] == GOLDEN["talib_version"]
    for name, entry in GOLDEN["series"].items():
        assert entry["close"] == SERIES[name], f"{name}: series generator changed"
        for key, value in entry.items():
            if isinstance(value, dict):
                for part, vals in value.items():
                    assert_series_equal(
                        live["series"][name][key][part], vals, label=f"{key}.{part}"
                    )
            else:
                assert_series_equal(live["series"][name][key], value, label=key)


# --- 1. against TA-Lib ----------------------------------------------------------------------


@pytest.mark.parametrize("name", SERIES_NAMES)
@pytest.mark.parametrize("n", [5, 20, 200])
def test_sma_matches_talib(name: str, n: int) -> None:
    closes = SERIES[name]
    ours = aligned(SMA(window=n).calculate(frame(closes)), len(closes))
    assert_series_equal(ours, GOLDEN["series"][name][f"sma_{n}"], label=f"SMA{n} {name}")


@pytest.mark.parametrize("name", SERIES_NAMES)
@pytest.mark.parametrize("n", [5, 20, 200])
def test_ema_matches_talib(name: str, n: int) -> None:
    closes = SERIES[name]
    ours = aligned(EMA(window=n).calculate(frame(closes)), len(closes))
    assert_series_equal(ours, GOLDEN["series"][name][f"ema_{n}"], label=f"EMA{n} {name}")


@pytest.mark.parametrize("name", SERIES_NAMES)
def test_rsi_matches_talib(name: str) -> None:
    closes = SERIES[name]
    ours = aligned(RSI(period=14).calculate(frame(closes)), len(closes))
    assert_series_equal(ours, GOLDEN["series"][name]["rsi_14"], label=f"RSI14 {name}")


@pytest.mark.parametrize("name", SERIES_NAMES)
def test_macd_sma_variant_matches_talib_macdext(name: str) -> None:
    closes = SERIES[name]
    results = MACD(ma_type="sma").calculate(frame(closes))
    gold = GOLDEN["series"][name]["macd_sma"]
    n = len(closes)
    assert_series_equal(aligned(results, n), gold["line"], label="line")
    assert_series_equal(aligned(results, n, "signal"), gold["signal"], label="signal")
    assert_series_equal(aligned(results, n, "histogram"), gold["hist"], label="hist")


@pytest.mark.parametrize("name", ["gbm_300", "idx_like_260"])
def test_macd_ema_variant_matches_talib_after_warmup(name: str) -> None:
    closes = SERIES[name]
    results = MACD(ma_type="ema").calculate(frame(closes))
    gold = GOLDEN["series"][name]["macd_ema"]
    n = len(closes)
    line, signal = aligned(results, n), aligned(results, n, "signal")
    # Same first output bar as TA-Lib (lookback slow-1 + signal-1 = 33) ...
    first = next(i for i, v in enumerate(line) if v is not None)
    assert first == next(i for i, v in enumerate(gold["line"]) if v is not None) == 33
    # ... and identical once TA-Lib's different fast-EMA seed has decayed.
    assert_series_equal(line, gold["line"], start=MACD_TALIB_CONVERGED_FROM, label="line")
    assert_series_equal(signal, gold["signal"], start=MACD_TALIB_CONVERGED_FROM, label="signal")


def test_talib_macd_seeding_explains_early_difference() -> None:
    """TA-Lib seeds the fast EMA with the SMA of the 12 closes ending at bar 25 (where the slow
    EMA starts), not of the first 12 closes. Modelling that reproduces TA-Lib exactly, so the
    early difference is TA-Lib's convention, not an error in ours (textbook EMA12 - EMA26)."""
    closes = SERIES["gbm_300"]
    k = 2 / 13
    fast = [math.nan] * len(closes)
    fast[25] = sum(closes[14:26]) / 12
    for i in range(26, len(closes)):
        fast[i] = closes[i] * k + fast[i - 1] * (1 - k)
    slow = ref.ema(closes, 26)
    line = [f - s for f, s in zip(fast, slow)]
    signal = ref.ema(line, 9)
    gold = GOLDEN["series"]["gbm_300"]["macd_ema"]
    assert_series_equal(as_none(line), gold["line"], start=33, label="line")
    assert_series_equal(as_none(signal), gold["signal"], start=33, label="signal")


# --- 2. against the independent stdlib reference --------------------------------------------


@pytest.mark.parametrize("name", SERIES_NAMES)
def test_all_match_stdlib_reference(name: str) -> None:
    closes = SERIES[name]
    df, n = frame(closes), len(closes)
    for w in (5, 20, 200):
        assert_series_equal(
            aligned(SMA(window=w).calculate(df), n), as_none(ref.sma(closes, w)), label=f"SMA{w}"
        )
        assert_series_equal(
            aligned(EMA(window=w).calculate(df), n), as_none(ref.ema(closes, w)), label=f"EMA{w}"
        )
    assert_series_equal(
        aligned(RSI(period=14).calculate(df), n), as_none(ref.rsi(closes, 14)), label="RSI14"
    )
    for ma in ("ema", "sma"):
        results = MACD(ma_type=ma).calculate(df)
        line, sig, hist = ref.macd(closes, ma=ma)
        # Our MACD reports from bar 33 (when the signal exists); the reference line starts at 25.
        line = [None if i < 33 else v for i, v in enumerate(as_none(line))]
        assert_series_equal(aligned(results, n), line, label=f"MACD {ma} line")
        assert_series_equal(aligned(results, n, "signal"), as_none(sig), label=f"MACD {ma} sig")
        assert_series_equal(aligned(results, n, "histogram"), as_none(hist), label=f"{ma} hist")


@pytest.mark.parametrize("name", SERIES_NAMES)
def test_stdlib_reference_matches_talib(name: str) -> None:
    """The reference and TA-Lib share no code; agreement checks both."""
    closes, gold = SERIES[name], GOLDEN["series"][name]
    for w in (5, 20, 200):
        assert_series_equal(as_none(ref.sma(closes, w)), gold[f"sma_{w}"], label=f"SMA{w}")
        assert_series_equal(as_none(ref.ema(closes, w)), gold[f"ema_{w}"], label=f"EMA{w}")
    assert_series_equal(as_none(ref.rsi(closes, 14)), gold["rsi_14"], label="RSI14")


# --- 3. hand-computed vectors ---------------------------------------------------------------


def test_sma_hand_vector() -> None:
    # SMA(3) of 1..5: (1+2+3)/3=2, (2+3+4)/3=3, (3+4+5)/3=4
    closes = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert aligned(SMA(window=3).calculate(frame(closes)), 5) == [None, None, 2.0, 3.0, 4.0]


def test_ema_hand_vector() -> None:
    # EMA(3), k = 2/(3+1) = 1/2, closes 2,4,6,8,10
    # seed (bar 2) = SMA of first 3 = (2+4+6)/3 = 4
    # bar 3 = 8*1/2 + 4*1/2 = 6 ; bar 4 = 10*1/2 + 6*1/2 = 8
    closes = [2.0, 4.0, 6.0, 8.0, 10.0]
    assert aligned(EMA(window=3).calculate(frame(closes)), 5) == [None, None, 4.0, 6.0, 8.0]


def test_rsi_hand_vector_wilder() -> None:
    # RSI(3), closes 10,11,10,12,11,13 -> changes +1,-1,+2,-1,+2
    # seed (changes 1..3): avg gain = (1+0+2)/3 = 1, avg loss = (0+1+0)/3 = 1/3
    #   bar 3: RS = 3 -> RSI = 100 - 100/4 = 75
    # bar 4 (change -1): gain = (1*2 + 0)/3 = 2/3, loss = (1/3*2 + 1)/3 = 5/9
    #   RS = 6/5 -> RSI = 100 - 100/(11/5) = 600/11 = 54.5454...
    # bar 5 (change +2): gain = (2/3*2 + 2)/3 = 10/9, loss = (5/9*2 + 0)/3 = 10/27
    #   RS = 3 -> RSI = 75
    # (The pre-fix code applied change 3 twice and reported 85.714 at bar 3.)
    closes = [10.0, 11.0, 10.0, 12.0, 11.0, 13.0]
    got = aligned(RSI(period=3).calculate(frame(closes)), 6)
    assert got[:3] == [None, None, None]
    assert got[3:] == pytest.approx([75.0, float(Fraction(600, 11)), 75.0], abs=1e-12)


def test_macd_ema_hand_vector() -> None:
    # MACD(fast=2, slow=3, signal=2), EMA mode, closes 1,2,4,8,16,32
    # EMA2 (k=2/3): bar1 1.5, bar2 19/6, bar3 115/18, bar4 691/54, bar5 4147/162
    # EMA3 (k=1/2): bar2 7/3, bar3 31/6, bar4 127/12, bar5 511/24
    # line = EMA2-EMA3: bar2 5/6, bar3 11/9, bar4 239/108, bar5 2791/648
    # signal = EMA2 of line, seed bar3 = (5/6 + 11/9)/2 = 37/36, bar4 589/324, bar5 845/243
    closes = [1.0, 2.0, 4.0, 8.0, 16.0, 32.0]
    results = MACD(fast_period=2, slow_period=3, signal_period=2, ma_type="ema").calculate(
        frame(closes)
    )
    by_bar = {(r.date - date(2021, 1, 4)).days: r for r in results}
    expected_line = {3: Fraction(11, 9), 4: Fraction(239, 108), 5: Fraction(2791, 648)}
    expected_signal = {3: Fraction(37, 36), 4: Fraction(589, 324), 5: Fraction(845, 243)}
    assert sorted(by_bar) == [3, 4, 5]  # first output once the signal exists (2+3-2 = bar 3)
    for bar, value in expected_line.items():
        assert by_bar[bar].value == pytest.approx(float(value), abs=1e-12)
        assert by_bar[bar].metadata["signal"] == pytest.approx(
            float(expected_signal[bar]), abs=1e-12
        )
        assert by_bar[bar].metadata["histogram"] == pytest.approx(
            float(value - expected_signal[bar]), abs=1e-12
        )


# --- warm-up and edge cases -----------------------------------------------------------------


def test_warmup_lengths() -> None:
    closes = SERIES["gbm_300"]
    df = frame(closes)

    def first_bar(results) -> int:
        return min((r.date - date(2021, 1, 4)).days for r in results)

    assert first_bar(SMA(window=20).calculate(df)) == 19
    assert first_bar(EMA(window=20).calculate(df)) == 19
    assert first_bar(RSI(period=14).calculate(df)) == 14
    assert first_bar(MACD(ma_type="ema").calculate(df)) == 33
    assert first_bar(MACD(ma_type="sma").calculate(df)) == 33


def test_too_short_series_yields_no_values() -> None:
    df = frame(SERIES["short_20"][:14])  # RSI(14) needs 15 closes
    assert RSI(period=14).calculate(df) == []
    assert EMA(window=20).calculate(df) == []
    assert SMA(window=20).calculate(df) == []
    assert MACD(ma_type="ema").calculate(df) == []


def test_flat_window_rsi_is_neutral_like_talib() -> None:
    # No gains and no losses in the averaging window (e.g. a newly listed or untraded stock
    # whose close never moved): Wilder's RS is 0/0. TA-Lib returns 50; so do we (was 100).
    # A flat stretch later in a series does not reach 0/0, because Wilder smoothing keeps
    # memory of earlier moves; that case is covered by the idx_like_260 golden series.
    closes = [100.0] * 20 + [101.0, 100.0]
    ours = aligned(RSI(period=14).calculate(frame(closes)), len(closes))
    assert ours[14:20] == [50.0] * 6
    talib = pytest.importorskip("talib")
    import numpy as np

    expected = [None if math.isnan(v) else float(v) for v in talib.RSI(np.array(closes), 14)]
    assert_series_equal(ours, expected, label="flat RSI")


# --- VWAP: definition still open --------------------------------------------------------------


@pytest.mark.xfail(
    strict=True,
    reason="VWAP definition pending Aditya's decision (daily value/volume, rolling-N or "
    "anchored); the current cumulative-since-first-bar VWAP depends on the history start",
)
def test_vwap_does_not_depend_on_history_start() -> None:
    df = frame(SERIES["gbm_300"])
    full = VWAP().calculate(df)[-1].value
    recent = VWAP().calculate(df.iloc[100:].reset_index(drop=True))[-1].value
    assert full == pytest.approx(recent, rel=1e-9)
