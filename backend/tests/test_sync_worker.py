"""Sync worker tests against PostgreSQL with a fake data provider (no network).

Skipped unless TEST_DATABASE_URL is set (see conftest.py).
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, datetime, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import get_db
from app.models import DailyPrice, Index, SyncJob, SyncStatus, TechnicalIndicator, Ticker
from app.services.data_sync import DataSyncService
from app.sync import runner
from app.sync.market_time import WIB

TODAY = date(2026, 11, 16)  # Monday
AFTER_CLOSE = datetime(2026, 11, 16, 18, 0, tzinfo=WIB)
INTRADAY = datetime(2026, 11, 16, 10, 30, tzinfo=WIB)


def bars(end: date, n: int = 60, base: float = 1000.0, last_close: float | None = None):
    """n consecutive weekday bars ending at `end` (inclusive), deterministic prices."""
    days: list[date] = []
    d = end
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    days.reverse()
    closes = [base + (i % 7) * 5 - (i % 3) * 3 for i in range(n)]
    if last_close is not None:
        closes[-1] = last_close
    return pd.DataFrame(
        {
            "Date": days,
            "Open": closes,
            "High": [c + 10 for c in closes],
            "Low": [c - 10 for c in closes],
            "Close": closes,
            "Volume": [100_000 + i for i in range(n)],
        }
    )


class FakeProvider:
    def __init__(self, data: dict[str, pd.DataFrame | Exception], symbols: list[str]):
        self.data = data
        self.symbols = symbols
        self.calls: list[tuple[str, str, str]] = []
        self.on_fetch = None

    def fetch_bars(self, symbol: str, start: str, end: str, suffix: str):
        self.calls.append((symbol, start, end))
        if self.on_fetch:
            self.on_fetch(symbol)
        value = self.data[symbol]
        if isinstance(value, Exception):
            raise value
        start_d = date.fromisoformat(start[:10])
        return value[value["Date"] >= start_d].copy()

    def fetch_ticker_list(self, index_code: str):
        return list(self.symbols)


@pytest.fixture
def factory(migrated_url: str) -> Iterator[sessionmaker[Session]]:
    engine = create_engine(migrated_url)
    with Session(engine) as s:
        s.add(Index(code="JCI", name="Jakarta Composite Index", yfinance_suffix=".JK"))
        s.commit()
    yield sessionmaker(bind=engine, autoflush=False)
    engine.dispose()


def service_factory(provider: FakeProvider, now: datetime):
    return lambda db: DataSyncService(
        db,
        fetch_bars=provider.fetch_bars,
        fetch_ticker_list=provider.fetch_ticker_list,
        now=lambda: now,
    )


def count(factory: sessionmaker[Session], model, *where) -> int:
    with factory() as s:
        return s.scalar(select(func.count()).select_from(model).where(*where))


def job(factory: sessionmaker[Session], sync_id: str) -> SyncJob:
    with factory() as s:
        return s.scalar(select(SyncJob).where(SyncJob.sync_id == sync_id))


def test_run_records_per_ticker_failures(factory) -> None:
    provider = FakeProvider(
        {"AAAA": bars(TODAY), "BBBB": RuntimeError("upstream 404")}, ["AAAA", "BBBB"]
    )
    out = runner.run_job(
        factory, index_code="JCI", workers=2, service_factory=service_factory(provider, AFTER_CLOSE)
    )

    assert out.exit_code == runner.EXIT_PARTIAL
    j = job(factory, out.sync_id)
    assert (j.status, j.total_tickers, j.processed_tickers, j.failed_tickers) == (
        "completed",
        2,
        2,
        1,
    )
    assert "BBBB" in j.error_message and "upstream 404" in j.error_message
    with factory() as s:
        statuses = {
            sym: (st.status, st.error_message)
            for sym, st in s.execute(select(Ticker.symbol, SyncStatus).join(SyncStatus))
        }
    assert statuses["AAAA"] == ("completed", None)
    assert statuses["BBBB"][0] == "error" and "upstream 404" in statuses["BBBB"][1]
    assert count(factory, DailyPrice) == 60
    assert count(factory, TechnicalIndicator) > 0


def test_all_tickers_failing_fails_the_job(factory) -> None:
    provider = FakeProvider({"AAAA": RuntimeError("down")}, ["AAAA"])
    out = runner.run_job(
        factory, index_code="JCI", service_factory=service_factory(provider, AFTER_CLOSE)
    )
    assert out.exit_code == runner.EXIT_FAILED
    assert job(factory, out.sync_id).status == "failed"


def test_partial_intraday_bar_is_not_stored(factory) -> None:
    provider = FakeProvider({"AAAA": bars(TODAY)}, ["AAAA"])
    runner.run_job(factory, index_code="JCI", service_factory=service_factory(provider, INTRADAY))
    assert count(factory, DailyPrice, DailyPrice.date == TODAY) == 0
    assert count(factory, DailyPrice) == 59

    # After the close the next run stores it.
    runner.run_job(
        factory, index_code="JCI", service_factory=service_factory(provider, AFTER_CLOSE)
    )
    assert count(factory, DailyPrice, DailyPrice.date == TODAY) == 1


def test_rerun_is_idempotent_and_picks_up_revisions(factory) -> None:
    provider = FakeProvider({"AAAA": bars(TODAY)}, ["AAAA"])
    sf = service_factory(provider, AFTER_CLOSE)
    runner.run_job(factory, index_code="JCI", service_factory=sf)
    n_prices, n_ind = count(factory, DailyPrice), count(factory, TechnicalIndicator)

    runner.run_job(factory, index_code="JCI", service_factory=sf)  # unchanged data
    assert (count(factory, DailyPrice), count(factory, TechnicalIndicator)) == (n_prices, n_ind)
    # second fetch starts SYNC_REFETCH_DAYS before the last stored bar
    assert provider.calls[-1][1] == (TODAY - timedelta(days=7)).isoformat()

    provider.data["AAAA"] = bars(TODAY, last_close=1234.0)  # source revises the last bar
    runner.run_job(factory, index_code="JCI", service_factory=sf)
    with factory() as s:
        close = s.scalar(select(DailyPrice.close).where(DailyPrice.date == TODAY))
        sma5 = s.scalar(
            select(TechnicalIndicator.value).where(
                TechnicalIndicator.date == TODAY,
                TechnicalIndicator.indicator_type == "sma",
                TechnicalIndicator.window_period == 5,
            )
        )
        prev = s.scalars(
            select(DailyPrice.close).where(DailyPrice.date < TODAY).order_by(DailyPrice.date.desc())
        ).all()[:4]
    assert close == 1234.0
    assert sma5 == pytest.approx((1234.0 + sum(prev)) / 5)
    assert count(factory, DailyPrice) == n_prices


def test_lock_prevents_concurrent_runs(factory) -> None:
    with factory() as s:
        index_id = s.scalar(select(Index.id).where(Index.code == "JCI"))
    held = runner.IndexLock(factory.kw["bind"], index_id)
    assert held.acquire()
    try:
        provider = FakeProvider({"AAAA": bars(TODAY)}, ["AAAA"])
        out = runner.run_job(
            factory, index_code="JCI", service_factory=service_factory(provider, AFTER_CLOSE)
        )
    finally:
        held.release()
    assert out.exit_code == runner.EXIT_BUSY
    assert "already running" in job(factory, out.sync_id).error_message
    assert provider.calls == []


def test_recover_stale_jobs(factory) -> None:
    now = runner.utcnow()
    with factory() as s:
        index_id = s.scalar(select(Index.id).where(Index.code == "JCI"))
        s.add_all(
            [
                SyncJob(sync_id="dead_running", index_id=index_id, status="in_progress"),
                SyncJob(sync_id="fresh_pending", index_id=index_id, status="pending"),
                SyncJob(
                    sync_id="old_pending",
                    index_id=index_id,
                    status="pending",
                    started_at=now - timedelta(hours=1),
                ),
            ]
        )
        s.commit()

    recovered = runner.recover_stale_jobs(factory, now=now, pending_grace_seconds=300)
    assert sorted(recovered) == ["dead_running", "old_pending"]
    assert job(factory, "fresh_pending").status == "pending"
    assert job(factory, "dead_running").status == "failed"


def test_recover_skips_jobs_whose_worker_holds_the_lock(factory) -> None:
    with factory() as s:
        index_id = s.scalar(select(Index.id).where(Index.code == "JCI"))
        s.add(SyncJob(sync_id="live", index_id=index_id, status="in_progress"))
        s.commit()
    held = runner.IndexLock(factory.kw["bind"], index_id)
    assert held.acquire()
    try:
        assert runner.recover_stale_jobs(factory) == []
    finally:
        held.release()


def test_cancel_stops_remaining_tickers(factory) -> None:
    symbols = ["AAAA", "BBBB", "CCCC", "DDDD"]
    provider = FakeProvider({s: bars(TODAY) for s in symbols}, symbols)

    def cancel_on_first(symbol: str) -> None:
        if len(provider.calls) == 1:
            with factory() as s:
                j = s.scalar(select(SyncJob).where(SyncJob.status == "in_progress"))
                j.status = "cancelled"
                s.commit()

    provider.on_fetch = cancel_on_first
    out = runner.run_job(
        factory, index_code="JCI", workers=1, service_factory=service_factory(provider, AFTER_CLOSE)
    )
    assert out.status == "cancelled"
    assert job(factory, out.sync_id).status == "cancelled"
    assert len(provider.calls) < len(symbols)


def test_run_existing_pending_job_by_sync_id(factory) -> None:
    with factory() as s:
        index = s.scalar(select(Index).where(Index.code == "JCI"))
        created = runner.create_job(s, index)
        sync_id = created.sync_id
    provider = FakeProvider({"AAAA": bars(TODAY)}, ["AAAA"])
    out = runner.run_job(
        factory, sync_id=sync_id, service_factory=service_factory(provider, AFTER_CLOSE)
    )
    assert (out.sync_id, out.exit_code) == (sync_id, runner.EXIT_OK)
    # a finished job cannot be run again
    again = runner.run_job(factory, sync_id=sync_id)
    assert again.exit_code == runner.EXIT_FAILED


def test_api_start_spawns_worker_and_rejects_duplicates(factory, monkeypatch) -> None:
    import app.routers.sync as sync_router
    from app.main import app

    spawned: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        sync_router, "_spawn_sync_worker", lambda sid, start: spawned.append((sid, start))
    )

    def override_db():
        with factory() as s:
            yield s

    app.dependency_overrides[get_db] = override_db
    try:
        client = TestClient(app)
        first = client.post("/api/v1/sync/start", params={"index_code": "jci"})
        assert first.status_code == 200
        sync_id = first.json()["sync_id"]
        assert spawned == [(sync_id, None)]
        assert job(factory, sync_id).status == "pending"

        second = client.post("/api/v1/sync/start", params={"index_code": "JCI"})
        assert second.status_code == 409
        assert sync_id in second.json()["detail"]

        bad = client.post(
            "/api/v1/sync/start", params={"index_code": "JCI", "start_date": "2024/01/01"}
        )
        assert bad.status_code == 400

        progress = client.get("/api/v1/sync/progress", params={"sync_id": sync_id}).json()
        assert progress["progress"]["failed_tickers"] == 0
    finally:
        app.dependency_overrides.clear()


def test_duplicate_dates_from_source_do_not_break_the_upsert(factory) -> None:
    df = bars(TODAY, n=10)
    dup = pd.concat([df, df.tail(1).assign(Close=999.0)], ignore_index=True)
    provider = FakeProvider({"AAAA": dup}, ["AAAA"])
    out = runner.run_job(
        factory, index_code="JCI", service_factory=service_factory(provider, AFTER_CLOSE)
    )
    assert out.exit_code == runner.EXIT_OK
    with factory() as s:
        assert s.scalar(select(DailyPrice.close).where(DailyPrice.date == TODAY)) == 999.0
    assert count(factory, DailyPrice) == 10
