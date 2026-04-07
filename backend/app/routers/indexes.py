"""
Index management router - CRUD operations for market indexes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.db.database import get_db
from app.models import Index, Ticker


# Request/Response schemas
class IndexCreate(BaseModel):
    code: str
    name: str
    yfinance_suffix: Optional[str] = ""


class IndexUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None
    yfinance_suffix: Optional[str] = None


class IndexResponse(BaseModel):
    id: int
    code: str
    name: str
    yfinance_suffix: str
    ticker_count: int
    is_active: bool
    last_synced_at: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


router = APIRouter(prefix="/indexes", tags=["indexes"])


@router.get("")
def list_indexes(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: Session = Depends(get_db)
):
    """
    List all indexes with optional filtering.

    Returns list of indexes with their details.
    """
    query = db.query(Index)

    if is_active is not None:
        query = query.filter(Index.is_active == is_active)

    indexes = query.order_by(Index.code).all()

    return {
        "total": len(indexes),
        "data": [
            {
                "id": idx.id,
                "code": idx.code,
                "name": idx.name,
                "yfinance_suffix": idx.yfinance_suffix or "",
                "ticker_count": idx.ticker_count,
                "is_active": idx.is_active,
                "last_synced_at": idx.last_synced_at.isoformat() if idx.last_synced_at else None,
                "created_at": idx.created_at.isoformat() if idx.created_at else None
            }
            for idx in indexes
        ]
    }


@router.get("/{index_id}")
def get_index(
    index_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a single index by ID.

    Returns the index details.
    """
    index = db.query(Index).filter(Index.id == index_id).first()

    if not index:
        raise HTTPException(status_code=404, detail=f"Index with id {index_id} not found")

    return {
        "id": index.id,
        "code": index.code,
        "name": index.name,
        "yfinance_suffix": index.yfinance_suffix or "",
        "ticker_count": index.ticker_count,
        "is_active": index.is_active,
        "last_synced_at": index.last_synced_at.isoformat() if index.last_synced_at else None,
        "created_at": index.created_at.isoformat() if index.created_at else None
    }


@router.post("")
def create_index(
    index_data: IndexCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new market index.

    Returns the created index.
    """
    existing = db.query(Index).filter(Index.code == index_data.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Index with code '{index_data.code}' already exists")

    index = Index(
        code=index_data.code.upper(),
        name=index_data.name,
        yfinance_suffix=index_data.yfinance_suffix or "",
        is_active=True
    )
    db.add(index)
    db.commit()
    db.refresh(index)

    return {
        "id": index.id,
        "code": index.code,
        "name": index.name,
        "yfinance_suffix": index.yfinance_suffix or "",
        "ticker_count": index.ticker_count,
        "is_active": index.is_active,
        "last_synced_at": index.last_synced_at.isoformat() if index.last_synced_at else None,
        "created_at": index.created_at.isoformat() if index.created_at else None
    }


@router.patch("/{index_id}")
def update_index(
    index_id: int,
    index_data: IndexUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing index.

    Supports partial updates (only provided fields are updated).
    """
    index = db.query(Index).filter(Index.id == index_id).first()

    if not index:
        raise HTTPException(status_code=404, detail=f"Index with id {index_id} not found")

    # Update fields if provided
    if index_data.code is not None:
        # Check if new code already exists
        existing = db.query(Index).filter(Index.code == index_data.code.upper(), Index.id != index_id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Index with code '{index_data.code}' already exists")
        index.code = index_data.code.upper()
    if index_data.name is not None:
        index.name = index_data.name
    if index_data.is_active is not None:
        index.is_active = index_data.is_active
    if index_data.yfinance_suffix is not None:
        index.yfinance_suffix = index_data.yfinance_suffix

    db.commit()
    db.refresh(index)

    return {
        "id": index.id,
        "code": index.code,
        "name": index.name,
        "yfinance_suffix": index.yfinance_suffix or "",
        "ticker_count": index.ticker_count,
        "is_active": index.is_active,
        "last_synced_at": index.last_synced_at.isoformat() if index.last_synced_at else None,
        "created_at": index.created_at.isoformat() if index.created_at else None
    }


@router.delete("/{index_id}")
def delete_index(
    index_id: int,
    hard_delete: bool = Query(False, description="Permanently delete the index (also deletes all associated tickers)"),
    db: Session = Depends(get_db)
):
    """
    Delete an index.

    By default, performs a soft delete (sets is_active=False).
    Set hard_delete=true to permanently remove the index.

    Note: Hard delete will cascade delete all associated tickers and their data.
    """
    index = db.query(Index).filter(Index.id == index_id).first()

    if not index:
        raise HTTPException(status_code=404, detail=f"Index with id {index_id} not found")

    # Count associated tickers
    ticker_count = db.query(Ticker).filter(Ticker.index_id == index_id).count()

    if hard_delete:
        # Permanent delete - cascade will handle tickers
        db.delete(index)
        db.commit()
        return {
            "deleted": True,
            "hard_delete": True,
            "id": index_id,
            "code": index.code,
            "message": f"Index '{index.code}' permanently deleted along with {ticker_count} associated tickers"
        }
    else:
        # Soft delete
        index.is_active = False
        db.commit()
        return {
            "deleted": True,
            "hard_delete": False,
            "id": index_id,
            "code": index.code,
            "is_active": False,
            "message": f"Index '{index.code}' deactivated (soft delete). Use hard_delete=true to permanently remove."
        }