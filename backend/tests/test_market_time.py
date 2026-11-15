from datetime import date, datetime, time, timedelta, timezone

import pandas as pd
import pytest

from app.sync.market_time import WIB, drop_unfinished_bars, is_bar_final

TODAY = date(2026, 11, 16)  # a Monday
CUTOFF = time(17, 0)


def wib(hour: int, minute: int = 0, day: date = TODAY) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=WIB)


@pytest.mark.parametrize(
    ("bar_date", "now", "expected"),
    [
        (TODAY - timedelta(days=1), wib(9), True),  # yesterday is always final
        (TODAY, wib(10, 30), False),  # intraday: partial bar
        (TODAY, wib(16, 59), False),  # after the closing auction but before the cutoff
        (TODAY, wib(17, 0), True),
        (TODAY, wib(21), True),
        (TODAY + timedelta(days=1), wib(21), False),  # never store a future-dated bar
    ],
)
def test_is_bar_final(bar_date: date, now: datetime, expected: bool) -> None:
    assert is_bar_final(bar_date, now, CUTOFF) is expected


def test_is_bar_final_uses_jakarta_date_not_utc() -> None:
    # 2026-11-16 01:00 WIB is still 2026-11-15 in UTC; Jakarta's date decides.
    now_utc = datetime(2026, 11, 15, 18, 0, tzinfo=timezone.utc)
    assert is_bar_final(date(2026, 11, 15), now_utc, CUTOFF) is True
    assert is_bar_final(date(2026, 11, 16), now_utc, CUTOFF) is False


def test_drop_unfinished_bars_keeps_only_final_rows() -> None:
    df = pd.DataFrame({"Date": [TODAY - timedelta(days=1), TODAY], "Close": [100.0, 101.0]})
    before = drop_unfinished_bars(df, wib(11), CUTOFF)
    after = drop_unfinished_bars(df, wib(18), CUTOFF)
    assert list(before["Date"]) == [TODAY - timedelta(days=1)]
    assert list(after["Date"]) == [TODAY - timedelta(days=1), TODAY]


def test_drop_unfinished_bars_handles_empty_frame() -> None:
    assert drop_unfinished_bars(pd.DataFrame(), wib(11), CUTOFF).empty
