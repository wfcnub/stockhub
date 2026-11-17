"""Sync job orchestration, run by the sync worker process (python -m app.sync).

- One job per index at a time, enforced with a PostgreSQL session-level advisory lock that is
  held for the whole run. The lock disappears when the worker's connection closes (exit, crash,
  restart), which is how abandoned jobs are recognised.
- Tickers are synced in a thread pool (I/O-bound downloads); each task uses its own Session.
  The API process never runs this; it only starts the worker.
- Every ticker failure is recorded (sync_status per ticker, sync_jobs.failed_tickers and a
  summary in sync_jobs.error_message) instead of being swallowed.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import Connection, Engine, func, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models import Index, SyncJob, Ticker
from app.services.data_sync import DataSyncService

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("pending", "in_progress", "running")
# First key of the two-int advisory lock; the second key is the index id.
SYNC_LOCK_NAMESPACE = 0x53594E43  # "SYNC"
ERROR_MESSAGE_MAX = 500
FAILED_SYMBOLS_IN_SUMMARY = 10

EXIT_OK = 0  # completed without ticker failures, or cancelled on request
EXIT_FAILED = 1  # job failed (setup error, ticker-list error, or every ticker failed)
EXIT_PARTIAL = 2  # completed, but some tickers failed (see sync_status)
EXIT_BUSY = 3  # another sync for the same index holds the lock

ServiceFactory = Callable[[Session], DataSyncService]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_sync_id(now: Optional[datetime] = None) -> str:
    """Readable and collision-free: timestamp plus 32 random bits."""
    stamp = (now or utcnow()).astimezone(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"sync_{stamp}_{secrets.token_hex(4)}"


def _truncate(message: str) -> str:
    return message[:ERROR_MESSAGE_MAX]


class IndexLock:
    """Session-level advisory lock for one index, held on a dedicated connection."""

    def __init__(self, engine: Engine, index_id: int):
        self.engine = engine
        self.index_id = index_id
        self._conn: Optional[Connection] = None

    def acquire(self) -> bool:
        conn = self.engine.connect()
        got = conn.execute(
            text("SELECT pg_try_advisory_lock(:ns, :idx)"),
            {"ns": SYNC_LOCK_NAMESPACE, "idx": self.index_id},
        ).scalar_one()
        conn.commit()  # end the implicit transaction; the session-level lock stays held
        if got:
            self._conn = conn
        else:
            conn.close()
        return bool(got)

    def release(self) -> None:
        if self._conn is None:
            return
        try:
            self._conn.execute(
                text("SELECT pg_advisory_unlock(:ns, :idx)"),
                {"ns": SYNC_LOCK_NAMESPACE, "idx": self.index_id},
            )
            self._conn.commit()
        finally:
            self._conn.close()
            self._conn = None

    @staticmethod
    def is_held(engine: Engine, index_id: int) -> bool:
        """True if some live session holds the lock for this index."""
        probe = IndexLock(engine, index_id)
        if probe.acquire():
            probe.release()
            return False
        return True


def _engine_of(session_factory: sessionmaker[Session]) -> Engine:
    bind = session_factory.kw.get("bind")
    if not isinstance(bind, Engine):
        raise RuntimeError("session_factory must be bound to an Engine")
    return bind


def _fail_job(job: SyncJob, message: str) -> None:
    job.status = "failed"
    job.error_message = _truncate(message)
    job.current_ticker = None
    job.completed_at = utcnow()


def recover_stale_jobs(
    session_factory: sessionmaker[Session],
    now: Optional[datetime] = None,
    pending_grace_seconds: Optional[int] = None,
) -> list[str]:
    """Mark active jobs whose worker is gone as failed. Returns the affected sync_ids.

    A job is stale when no live session holds its index lock. Fresh `pending` jobs get a grace
    period, because the worker that will take them may still be starting.
    """
    now = now or utcnow()
    grace = timedelta(
        seconds=settings.SYNC_PENDING_GRACE_SECONDS
        if pending_grace_seconds is None
        else pending_grace_seconds
    )
    engine = _engine_of(session_factory)
    recovered: list[str] = []
    with session_factory() as db:
        jobs = db.scalars(select(SyncJob).where(SyncJob.status.in_(ACTIVE_STATUSES))).all()
        for job in jobs:
            if job.status == "pending" and job.started_at and job.started_at > now - grace:
                continue
            if IndexLock.is_held(engine, job.index_id):
                continue
            _fail_job(job, "Interrupted: no sync worker is running this job (crash or restart)")
            recovered.append(job.sync_id)
        db.commit()
    for sync_id in recovered:
        logger.warning("Marked stale sync job %s as failed", sync_id)
    return recovered


@dataclass
class JobOutcome:
    sync_id: Optional[str]
    status: str
    exit_code: int
    total: int = 0
    processed: int = 0
    failed: int = 0
    failed_symbols: list[str] = field(default_factory=list)
    message: Optional[str] = None


def create_job(db: Session, index: Index) -> SyncJob:
    total = db.scalar(
        select(func.count())
        .select_from(Ticker)
        .where(Ticker.index_id == index.id, Ticker.is_active.is_(True))
    )
    job = SyncJob(
        sync_id=new_sync_id(), index_id=index.id, status="pending", total_tickers=total or 0
    )
    db.add(job)
    db.commit()
    return job


def _sync_one(
    session_factory: sessionmaker[Session],
    service_factory: ServiceFactory,
    ticker_id: int,
    start_date: Optional[str],
    full_recompute: bool,
) -> tuple[str, Optional[str]]:
    """Sync one ticker in its own session. Returns (symbol, error or None)."""
    with session_factory() as db:
        ticker = db.get(Ticker, ticker_id)
        if ticker is None:
            return f"#{ticker_id}", "ticker no longer exists"
        symbol = ticker.symbol
        try:
            service_factory(db).sync_ticker(ticker, start_date, full_recompute=full_recompute)
            return symbol, None
        except Exception as exc:  # recorded in sync_status by sync_ticker
            logger.warning("Sync failed for %s: %s: %s", symbol, type(exc).__name__, exc)
            return symbol, f"{type(exc).__name__}: {exc}"


def run_job(
    session_factory: sessionmaker[Session],
    *,
    index_code: Optional[str] = None,
    sync_id: Optional[str] = None,
    start_date: Optional[str] = None,
    workers: Optional[int] = None,
    skip_ticker_list: bool = False,
    full_recompute: bool = False,
    service_factory: Optional[ServiceFactory] = None,
) -> JobOutcome:
    """Run one sync job for an index, either an existing pending job (sync_id) or a new one."""
    if (index_code is None) == (sync_id is None):
        raise ValueError("pass exactly one of index_code or sync_id")
    service_factory = service_factory or DataSyncService
    workers = max(1, workers or settings.SYNC_WORKERS)
    engine = _engine_of(session_factory)

    db = session_factory()
    lock: Optional[IndexLock] = None
    job: Optional[SyncJob] = None
    try:
        if sync_id is not None:
            job = db.scalar(select(SyncJob).where(SyncJob.sync_id == sync_id))
            if job is None:
                return JobOutcome(sync_id, "failed", EXIT_FAILED, message="sync job not found")
            if job.status != "pending":
                return JobOutcome(
                    sync_id, job.status, EXIT_FAILED, message=f"job is {job.status}, not pending"
                )
            index = db.get(Index, job.index_id)
            if index is None:
                _fail_job(job, f"Index {job.index_id} not found")
                db.commit()
                return JobOutcome(sync_id, "failed", EXIT_FAILED, message=job.error_message)
        else:
            assert index_code is not None
            index = db.scalar(select(Index).where(Index.code == index_code.upper()))
            if index is None:
                return JobOutcome(
                    None, "failed", EXIT_FAILED, message=f"Index {index_code} not found"
                )
            job = create_job(db, index)
        sync_id = job.sync_id

        lock = IndexLock(engine, index.id)
        if not lock.acquire():
            lock = None
            _fail_job(job, f"Another sync for {index.code} is already running")
            db.commit()
            return JobOutcome(sync_id, "failed", EXIT_BUSY, message=job.error_message)

        # We hold the index lock, so any other active job for this index has no live worker.
        for other in db.scalars(
            select(SyncJob).where(
                SyncJob.index_id == index.id,
                SyncJob.status.in_(ACTIVE_STATUSES),
                SyncJob.id != job.id,
            )
        ):
            _fail_job(other, "Interrupted: superseded by a newer sync worker")

        job.status = "in_progress"
        job.error_message = None
        db.commit()
        logger.info("Sync %s started for %s", sync_id, index.code)

        if not skip_ticker_list:
            try:
                service_factory(db).sync_index_ticker_list(index)
            except Exception as exc:
                db.rollback()
                _fail_job(job, f"Failed to sync ticker list: {type(exc).__name__}: {exc}")
                db.commit()
                return JobOutcome(sync_id, "failed", EXIT_FAILED, message=job.error_message)

        tickers = db.execute(
            select(Ticker.id, Ticker.symbol)
            .where(Ticker.index_id == index.id, Ticker.is_active.is_(True))
            .order_by(Ticker.symbol)
        ).all()
        job.total_tickers = len(tickers)
        job.processed_tickers = 0
        job.failed_tickers = 0
        db.commit()

        failed_symbols: list[str] = []
        first_error: Optional[str] = None
        cancelled = False
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="sync") as pool:
            futures = [
                pool.submit(
                    _sync_one, session_factory, service_factory, t.id, start_date, full_recompute
                )
                for t in tickers
            ]
            for future in as_completed(futures):
                symbol, error = future.result()
                db.refresh(job)
                if job.status == "cancelled":
                    cancelled = True
                    pool.shutdown(wait=True, cancel_futures=True)
                    break
                job.processed_tickers += 1
                job.current_ticker = symbol
                if error is not None:
                    job.failed_tickers += 1
                    failed_symbols.append(symbol)
                    first_error = first_error or f"{symbol}: {error}"
                db.commit()

        db.refresh(job)
        if cancelled or job.status == "cancelled":
            job.current_ticker = None
            job.completed_at = job.completed_at or utcnow()
            db.commit()
            logger.info("Sync %s cancelled", sync_id)
            return JobOutcome(
                sync_id,
                "cancelled",
                EXIT_OK,
                failed_symbols=failed_symbols,
                total=job.total_tickers,
                processed=job.processed_tickers,
                failed=job.failed_tickers,
            )

        job.current_ticker = None
        job.completed_at = utcnow()
        if failed_symbols:
            shown = ", ".join(sorted(failed_symbols)[:FAILED_SYMBOLS_IN_SUMMARY])
            more = len(failed_symbols) - FAILED_SYMBOLS_IN_SUMMARY
            summary = f"{len(failed_symbols)} of {job.total_tickers} tickers failed: {shown}"
            if more > 0:
                summary += f" (+{more} more)"
            job.error_message = _truncate(f"{summary}. First error: {first_error}")
        if job.total_tickers > 0 and job.failed_tickers == job.total_tickers:
            job.status = "failed"
            exit_code = EXIT_FAILED
        else:
            job.status = "completed"
            exit_code = EXIT_PARTIAL if failed_symbols else EXIT_OK
            index.last_synced_at = utcnow()
        index.ticker_count = job.total_tickers
        db.commit()
        logger.info(
            "Sync %s %s: %s/%s tickers, %s failed",
            sync_id,
            job.status,
            job.processed_tickers,
            job.total_tickers,
            job.failed_tickers,
        )
        return JobOutcome(
            sync_id,
            job.status,
            exit_code,
            failed_symbols=failed_symbols,
            message=job.error_message,
            total=job.total_tickers,
            processed=job.processed_tickers,
            failed=job.failed_tickers,
        )

    except Exception as exc:
        logger.exception("Sync %s failed", sync_id)
        db.rollback()
        if job is not None:
            try:
                db.refresh(job)
                _fail_job(job, f"{type(exc).__name__}: {exc}")
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Could not mark sync %s as failed", sync_id)
        return JobOutcome(sync_id, "failed", EXIT_FAILED, message=str(exc))
    finally:
        if lock is not None:
            lock.release()
        db.close()
