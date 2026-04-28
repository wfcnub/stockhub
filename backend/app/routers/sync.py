from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.data_sync import DataSyncService
from app.models import Index, Ticker, SyncJob
from typing import Optional
from datetime import datetime
import multiprocessing

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


@router.post("/start")
def start_sync(
    background_tasks: BackgroundTasks,
    index_code: str = Query(..., description="Index code to sync (e.g., JCI)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """
    Start a sync job for all tickers in an index.

    This will first update the ticker list from the remote source,
    then sync price data for all active tickers.

    Returns a sync_id that can be used to poll progress.
    """
    index = db.query(Index).filter(Index.code == index_code.upper()).first()
    if not index:
        raise HTTPException(status_code=404, detail=f"Index {index_code} not found")

    sync_id = f"sync_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    total_tickers = db.query(Ticker).filter(
        Ticker.index_id == index.id,
        Ticker.is_active == True
    ).count()

    sync_job = SyncJob(
        sync_id=sync_id,
        index_id=index.id,
        status="pending",
        total_tickers=total_tickers,
        processed_tickers=0
    )
    db.add(sync_job)
    db.commit()

    background_tasks.add_task(
        run_sync_job,
        sync_id=sync_id,
        index_id=index.id,
        start_date=start_date
    )

    return {
        "sync_id": sync_id,
        "index_code": index_code.upper(),
        "status": "in_progress",
        "message": f"Sync started for {index_code.upper()}"
    }


@router.get("/progress")
def get_sync_progress(
    sync_id: Optional[str] = Query(
        None,
        description="Sync job ID (optional; latest active job if omitted)",
    ),
    db: Session = Depends(get_db)
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
            "percent_complete": sync_job.progress_percent,
            "current_ticker": sync_job.current_ticker,
            "estimated_remaining_seconds": estimated_seconds
        }
    }


@router.post("/stop")
def stop_sync(
    sync_id: Optional[str] = Query(
        None,
        description="Sync job ID (optional; latest active job if omitted)",
    ),
    db: Session = Depends(get_db)
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
            "message": f"Sync already {api_status}"
        }

    sync_job.status = "cancelled"
    sync_job.error_message = "Sync stopped by user"
    sync_job.current_ticker = None
    sync_job.completed_at = datetime.now()
    db.commit()

    return {
        "sync_id": sync_job.sync_id,
        "status": "cancelled",
        "message": "Sync stopped successfully"
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


def _sync_ticker_worker(args):
    """Worker function for multiprocessing ticker sync"""
    ticker_id, start_date = args
    from app.db.database import SessionLocal
    
    db = SessionLocal()
    try:
        ticker = db.query(Ticker).filter(Ticker.id == ticker_id).first()
        if ticker:
            sync_service = DataSyncService(db)
            sync_service.sync_ticker(ticker, start_date)
            db.commit()
        return ticker_id, True
    except Exception:
        db.rollback()
        return ticker_id, False
    finally:
        db.close()


def run_sync_job(sync_id: str, index_id: int, start_date: Optional[str] = None, max_workers: int = 4):
    """Background task to run sync job with multiprocessing"""
    from app.db.database import SessionLocal

    db = SessionLocal()
    try:
        sync_job = db.query(SyncJob).filter(SyncJob.sync_id == sync_id).first()
        if not sync_job:
            return

        if sync_job.status == "cancelled":
            if not sync_job.completed_at:
                sync_job.completed_at = datetime.now()
                db.commit()
            return

        sync_job.status = "in_progress"
        db.commit()

        index = db.query(Index).filter(Index.id == index_id).first()
        if not index:
            sync_job.status = "failed"
            sync_job.error_message = f"Index {index_id} not found"
            sync_job.completed_at = datetime.now()
            db.commit()
            return

        sync_service = DataSyncService(db)

        try:
            sync_service.sync_index_ticker_list(index)
        except Exception as e:
            sync_job.status = "failed"
            sync_job.error_message = f"Failed to sync ticker list: {str(e)}"
            sync_job.completed_at = datetime.now()
            db.commit()
            return

        tickers = db.query(Ticker).filter(
            Ticker.index_id == index_id,
            Ticker.is_active == True
        ).all()

        sync_job.total_tickers = len(tickers)
        db.commit()

        ticker_args = [(ticker.id, start_date) for ticker in tickers]
        
        with multiprocessing.Pool(processes=max_workers) as pool:
            processed = 0
            for ticker_id, success in pool.imap_unordered(_sync_ticker_worker, ticker_args):
                processed += 1
                
                db.refresh(sync_job)
                if sync_job.status == "cancelled":
                    pool.terminate()
                    break
                
                ticker = next((t for t in tickers if t.id == ticker_id), None)
                sync_job.current_ticker = ticker.symbol if ticker else None
                sync_job.processed_tickers = processed
                db.commit()
        
        pool.join()

        db.refresh(sync_job)
        if sync_job.status == "cancelled":
            if not sync_job.completed_at:
                sync_job.completed_at = datetime.now()
            sync_job.current_ticker = None
            db.commit()
            return

        sync_job.status = "completed"
        sync_job.completed_at = datetime.now()
        sync_job.current_ticker = None

        index.last_synced_at = datetime.now()
        index.ticker_count = db.query(Ticker).filter(
            Ticker.index_id == index_id,
            Ticker.is_active == True
        ).count()

        db.commit()

    except Exception as e:
        sync_job = db.query(SyncJob).filter(SyncJob.sync_id == sync_id).first()
        if sync_job:
            sync_job.status = "failed"
            sync_job.error_message = str(e)
            sync_job.completed_at = datetime.now()
            db.commit()

    finally:
        db.close()


@router.post("/init-index")
def init_index(
    code: str = Query(..., description="Index code (e.g., JCI)"),
    name: str = Query(..., description="Index name"),
    yfinance_suffix: str = Query("", description="Yahoo Finance suffix (e.g., .JK for IDX)"),
    db: Session = Depends(get_db)
):
    """
    Initialize an index in the database.

    This creates the index record. Use /sync/start to populate and sync tickers.
    """
    existing = db.query(Index).filter(Index.code == code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Index {code} already exists")

    index = Index(
        code=code.upper(),
        name=name,
        yfinance_suffix=yfinance_suffix,
        is_active=True
    )
    db.add(index)
    db.commit()
    db.refresh(index)

    return {
        "id": index.id,
        "code": index.code,
        "name": index.name,
        "yfinance_suffix": index.yfinance_suffix
    }


@router.post("/discover/{index_code}")
def discover_tickers(
    index_code: str,
    db: Session = Depends(get_db)
):
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

        index.ticker_count = db.query(Ticker).filter(
            Ticker.index_id == index.id,
            Ticker.is_active == True
        ).count()
        db.commit()

        return {
            "index_code": index.code,
            "added": result["added"],
            "deactivated": result["deactivated"],
            "reactivated": result["reactivated"],
            "total_remote": result["total_remote"],
            "total_active_tickers": index.ticker_count
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
        "status": sync_status.status if sync_status else "never_synced"
    }
