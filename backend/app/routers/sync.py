from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.data_sync import DataSyncService
from app.services.ticker_fetcher import TickerFetcher
from app.models import Index, Ticker, SyncJob
from typing import Optional
import uuid
from datetime import datetime

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/start")
def start_sync(
    background_tasks: BackgroundTasks,
    index_code: str = Query(..., description="Index code to sync (e.g., IDX)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """
    Start a sync job for all tickers in an index.

    Returns a sync_id that can be used to poll progress.
    """
    # Validate index exists
    index = db.query(Index).filter(Index.code == index_code.upper()).first()
    if not index:
        raise HTTPException(status_code=404, detail=f"Index {index_code} not found")

    # Create sync job
    sync_id = f"sync_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # Count active tickers for this index
    total_tickers = db.query(Ticker).filter(
        Ticker.index_id == index.id,
        Ticker.is_active == True
    ).count()

    if total_tickers == 0:
        raise HTTPException(status_code=400, detail=f"No active tickers found for index {index_code}")

    sync_job = SyncJob(
        sync_id=sync_id,
        index_id=index.id,
        status="pending",
        total_tickers=total_tickers,
        processed_tickers=0
    )
    db.add(sync_job)
    db.commit()

    # Start background sync
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
    sync_id: str = Query(..., description="Sync job ID"),
    db: Session = Depends(get_db)
):
    """
    Poll sync job progress.

    Returns current status, processed count, and progress percentage.
    """
    sync_job = db.query(SyncJob).filter(SyncJob.sync_id == sync_id).first()
    if not sync_job:
        raise HTTPException(status_code=404, detail="Sync job not found")

    # Calculate estimated remaining time
    # Assuming average 2 seconds per ticker
    remaining_tickers = sync_job.total_tickers - sync_job.processed_tickers
    estimated_seconds = remaining_tickers * 2 if sync_job.status == "in_progress" else 0

    return {
        "sync_id": sync_job.sync_id,
        "status": sync_job.status,
        "progress": {
            "total_tickers": sync_job.total_tickers,
            "processed_tickers": sync_job.processed_tickers,
            "percent_complete": sync_job.progress_percent,
            "current_ticker": sync_job.current_ticker,
            "estimated_remaining_seconds": estimated_seconds
        }
    }


def run_sync_job(sync_id: str, index_id: int, start_date: Optional[str] = None):
    """Background task to run sync job"""
    from app.db.database import SessionLocal

    db = SessionLocal()
    try:
        sync_job = db.query(SyncJob).filter(SyncJob.sync_id == sync_id).first()
        if not sync_job:
            return

        # Update status to running
        sync_job.status = "running"
        db.commit()

        # Get index
        index = db.query(Index).filter(Index.id == index_id).first()

        # Get tickers to sync
        tickers = db.query(Ticker).filter(
            Ticker.index_id == index_id,
            Ticker.is_active == True
        ).all()

        sync_service = DataSyncService(db)
        processed = 0

        for ticker in tickers:
            try:
                sync_job.current_ticker = ticker.symbol
                db.commit()

                sync_service.sync_ticker(ticker, start_date)
                processed += 1
                sync_job.processed_tickers = processed
                db.commit()

            except Exception as e:
                # Log error but continue
                processed += 1
                sync_job.processed_tickers = processed
                db.commit()

        # Mark completed
        sync_job.status = "completed"
        sync_job.completed_at = datetime.now()
        sync_job.current_ticker = None

        # Update index last_synced_at
        index.last_synced_at = datetime.now()

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
    code: str = Query(..., description="Index code (e.g., IDX)"),
    name: str = Query(..., description="Index name"),
    db: Session = Depends(get_db)
):
    """
    Initialize an index in the database.

    This creates the index record and discovers all tickers.
    """
    existing = db.query(Index).filter(Index.code == code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Index {code} already exists")

    index = Index(
        code=code.upper(),
        name=name,
        is_active=True
    )
    db.add(index)
    db.commit()
    db.refresh(index)

    return {"id": index.id, "code": index.code, "name": index.name}


@router.post("/discover/{index_code}")
def discover_tickers(
    index_code: str,
    validate: bool = Query(False, description="Validate tickers by checking if they have data"),
    db: Session = Depends(get_db)
):
    """
    Discover and register all tickers for an index.
    """
    index = db.query(Index).filter(Index.code == index_code.upper()).first()
    if not index:
        raise HTTPException(status_code=404, detail=f"Index {index_code} not found")

    try:
        fetcher = TickerFetcher(index_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    all_tickers = fetcher.get_all_tickers()

    added_count = 0
    updated_count = 0
    skipped_count = 0

    for symbol in all_tickers:
        existing = db.query(Ticker).filter(Ticker.symbol == symbol).first()

        if existing:
            if not existing.is_active:
                existing.is_active = True
                updated_count += 1
            else:
                skipped_count += 1
        else:
            if validate:
                if not fetcher.validate_ticker(symbol):
                    continue

            info = fetcher.get_ticker_info(symbol)
            ticker = Ticker(
                symbol=symbol,
                name=info.get("name") if info else symbol,
                sector=info.get("sector") if info else None,
                industry=info.get("industry") if info else None,
                index_id=index.id,
                is_active=True
            )
            db.add(ticker)
            added_count += 1

    # Update index ticker count
    index.ticker_count = db.query(Ticker).filter(Ticker.index_id == index.id, Ticker.is_active == True).count()
    db.commit()

    return {
        "index_code": index.code,
        "total_discovered": len(all_tickers),
        "added": added_count,
        "updated": updated_count,
        "skipped_existing": skipped_count,
        "total_active_tickers": index.ticker_count
    }


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
        "last_sync_timestamp": sync_status.last_sync_timestamp.isoformat() if sync_status and sync_status.last_sync_timestamp else None,
        "status": sync_status.status if sync_status else "never_synced"
    }