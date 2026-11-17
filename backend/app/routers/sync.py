import logging
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import get_db
from app.models import Index, SyncJob, Ticker
from app.services.data_sync import DataSyncService
from app.sync.runner import ACTIVE_STATUSES, create_job, recover_stale_jobs

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]

router = APIRouter(prefix="/sync", tags=["sync"])


def _resolve_sync_job(db: Session, sync_id: Optional[str]) -> Optional[SyncJob]:
    if sync_id:
        return db.query(SyncJob).filter(SyncJob.sync_id == sync_id).first()

    return (
        db.query(SyncJob)
        .filter(SyncJob.status.in_(["pending", "in_progress", "running"]))
        .order_by(SyncJob.started_at.desc(), SyncJob.id.desc())
        .first()
    )


def _spawn_sync_worker(sync_id: str, start_date: Optional[str]) -> None:
    """Start the sync worker as its own process (never a pool inside the web process).

    start_new_session detaches it from the API's process group, so an API reload or restart
    does not kill a running sync.
    """
    cmd = [sys.executable, "-m", "app.sync", "run", "--sync-id", sync_id]
    if start_date:
        cmd += ["--start-date", start_date]
    subprocess.Popen(cmd, cwd=BACKEND_DIR, stdin=subprocess.DEVNULL, start_new_session=True)


@router.post("/start")
def start_sync(
    index_code: str = Query(..., description="Index code to sync (e.g., JCI)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """
    Start a sync job for all tickers in an index.

    Creates the job and starts the sync worker process (`python -m app.sync run --sync-id`),
    which updates the ticker list and then syncs price data for all active tickers.
    Returns a sync_id that can be used to poll progress. 409 if a sync for this index is
    already active.
    """
    index = db.query(Index).filter(Index.code == index_code.upper()).first()
    if not index:
        raise HTTPException(status_code=404, detail=f"Index {index_code} not found")

    if start_date:
        try:
            date.fromisoformat(start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD")

    # Clear jobs left behind by a crashed or restarted worker before checking for an active one.
    recover_stale_jobs(sessionmaker(bind=db.get_bind()))
    db.expire_all()
    active = (
        db.query(SyncJob)
        .filter(SyncJob.index_id == index.id, SyncJob.status.in_(ACTIVE_STATUSES))
        .first()
    )
    if active:
        raise HTTPException(
            status_code=409,
            detail=f"A sync for {index.code} is already active (sync_id={active.sync_id})",
        )

    sync_job = create_job(db, index)
    try:
        _spawn_sync_worker(sync_job.sync_id, start_date)
    except OSError as exc:
        sync_job.status = "failed"
        sync_job.error_message = f"Could not start sync worker: {exc}"[:500]
        sync_job.completed_at = datetime.now()
        db.commit()
        raise HTTPException(status_code=500, detail="Could not start sync worker")

    return {
        "sync_id": sync_job.sync_id,
        "index_code": index.code,
        "status": "in_progress",
        "message": f"Sync started for {index.code}",
    }


@router.get("/progress")
def get_sync_progress(
    sync_id: Optional[str] = Query(
        None,
        description="Sync job ID (optional; latest active job if omitted)",
    ),
    db: Session = Depends(get_db),
):
    """
    Poll sync job progress.

    Returns current status, processed count, and progress percentage.
    """
    sync_job = _resolve_sync_job(db, sync_id)

    if not sync_job:
        detail = "Sync job not found" if sync_id else "No active sync job found"
        raise HTTPException(status_code=404, detail=detail)

    # Keep API status aligned with contract while supporting legacy DB values.
    api_status = "in_progress" if sync_job.status == "running" else sync_job.status

    remaining_tickers = sync_job.total_tickers - sync_job.processed_tickers
    estimated_seconds = remaining_tickers * 2 if api_status in {"pending", "in_progress"} else 0

    return {
        "sync_id": sync_job.sync_id,
        "status": api_status,
        "progress": {
            "total_tickers": sync_job.total_tickers,
            "processed_tickers": sync_job.processed_tickers,
            "failed_tickers": sync_job.failed_tickers,
            "percent_complete": sync_job.progress_percent,
            "current_ticker": sync_job.current_ticker,
            "estimated_remaining_seconds": estimated_seconds,
        },
    }


@router.post("/stop")
def stop_sync(
    sync_id: Optional[str] = Query(
        None,
        description="Sync job ID (optional; latest active job if omitted)",
    ),
    db: Session = Depends(get_db),
):
    """
    Stop an active sync job.

    If sync_id is omitted, the latest active sync job will be stopped.
    """
    sync_job = _resolve_sync_job(db, sync_id)
    if not sync_job:
        detail = "Sync job not found" if sync_id else "No active sync job found"
        raise HTTPException(status_code=404, detail=detail)

    api_status = "in_progress" if sync_job.status == "running" else sync_job.status
    if api_status in {"completed", "failed", "cancelled"}:
        return {
            "sync_id": sync_job.sync_id,
            "status": api_status,
            "message": f"Sync already {api_status}",
        }

    sync_job.status = "cancelled"
    sync_job.error_message = "Sync stopped by user"
    sync_job.current_ticker = None
    sync_job.completed_at = datetime.now()
    db.commit()

    return {
        "sync_id": sync_job.sync_id,
        "status": "cancelled",
        "message": "Sync stopped successfully",
    }


@router.post("/migrate-macd")
def migrate_macd_data(
    index_code: Optional[str] = Query(None, description="Optional index code scope (e.g., JCI)"),
    include_inactive: bool = Query(False, description="Include inactive tickers"),
    db: Session = Depends(get_db),
):
    """
    Migrate legacy MACD storage and backfill selectable MACD modes.

    - Renames legacy `macd` rows to `macd_ema`
    - Recalculates and upserts both `macd_ema` and `macd_sma` using existing price data
    """
    index = None
    if index_code:
        index = db.query(Index).filter(Index.code == index_code.upper()).first()
        if not index:
            raise HTTPException(status_code=404, detail=f"Index {index_code} not found")

    sync_service = DataSyncService(db)
    result = sync_service.migrate_macd_modes(
        index_id=index.id if index else None,
        include_inactive=include_inactive,
    )

    return {
        "index_code": index.code if index else None,
        "include_inactive": include_inactive,
        **result,
    }


@router.post("/init-index")
def init_index(
    code: str = Query(..., description="Index code (e.g., JCI)"),
    name: str = Query(..., description="Index name"),
    yfinance_suffix: str = Query("", description="Yahoo Finance suffix (e.g., .JK for IDX)"),
    db: Session = Depends(get_db),
):
    """
    Initialize an index in the database.

    This creates the index record. Use /sync/start to populate and sync tickers.
    """
    existing = db.query(Index).filter(Index.code == code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Index {code} already exists")

    index = Index(code=code.upper(), name=name, yfinance_suffix=yfinance_suffix, is_active=True)
    db.add(index)
    db.commit()
    db.refresh(index)

    return {
        "id": index.id,
        "code": index.code,
        "name": index.name,
        "yfinance_suffix": index.yfinance_suffix,
    }


@router.post("/discover/{index_code}")
def discover_tickers(index_code: str, db: Session = Depends(get_db)):
    """
    Discover and sync ticker list for an index from the remote source.

    This will add new tickers, deactivate removed tickers, and reactivate
    tickers that have returned to the index.
    """
    index = db.query(Index).filter(Index.code == index_code.upper()).first()
    if not index:
        raise HTTPException(status_code=404, detail=f"Index {index_code} not found")

    sync_service = DataSyncService(db)

    try:
        result = sync_service.sync_index_ticker_list(index)

        index.ticker_count = (
            db.query(Ticker).filter(Ticker.index_id == index.id, Ticker.is_active == True).count()
        )
        db.commit()

        return {
            "index_code": index.code,
            "added": result["added"],
            "deactivated": result["deactivated"],
            "reactivated": result["reactivated"],
            "total_remote": result["total_remote"],
            "total_active_tickers": index.ticker_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync ticker list: {str(e)}")


@router.get("/status/{symbol}")
def get_sync_status(symbol: str, db: Session = Depends(get_db)):
    """Get last sync status for a ticker"""
    ticker = db.query(Ticker).filter(Ticker.symbol == symbol.upper()).first()
    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker not found")

    from app.models import SyncStatus

    sync_status = db.query(SyncStatus).filter(SyncStatus.ticker_id == ticker.id).first()

    return {
        "symbol": ticker.symbol,
        "name": ticker.name,
        "is_active": ticker.is_active,
        "last_sync_date": sync_status.last_sync_date if sync_status else None,
        "last_sync_timestamp": (
            sync_status.last_sync_timestamp.isoformat()
            if sync_status and sync_status.last_sync_timestamp
            else None
        ),
        "status": sync_status.status if sync_status else "never_synced",
    }
