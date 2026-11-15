"""IDX market-time helpers (Asia/Jakarta, WIB = UTC+7, no daylight saving)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import pandas as pd

from app.config import settings

WIB = timezone(timedelta(hours=7), "WIB")


def now_wib() -> datetime:
    return datetime.now(WIB)


def bar_final_after() -> time:
    return time.fromisoformat(settings.SYNC_BAR_FINAL_AFTER)


def is_bar_final(bar_date: date, now: datetime, final_after: time | None = None) -> bool:
    """A daily bar is final if its day is over in Jakarta, or today after the cutoff."""
    local_now = now.astimezone(WIB)
    today = local_now.date()
    if bar_date < today:
        return True
    if bar_date > today:
        return False
    return local_now.time() >= (final_after or bar_final_after())


def drop_unfinished_bars(
    df: pd.DataFrame, now: datetime, final_after: time | None = None
) -> pd.DataFrame:
    """Remove bars that may still change (today's bar before the cutoff, or future dates)."""
    if df.empty or "Date" not in df.columns:
        return df
    mask = [is_bar_final(d, now, final_after) for d in df["Date"]]
    return df.loc[mask]
