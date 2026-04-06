"""
Database initialization script
Run this to create all tables if they don't exist
"""
from sqlalchemy import inspect
from app.db.database import engine, Base
from app.models import Index, Ticker, DailyPrice, SyncStatus, KeyMetric, SyncJob, TechnicalIndicator


def init_db():
    """Create all tables if they don't already exist"""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    # Get expected table names from the models
    expected_tables = [
        "indexes",
        "tickers", 
        "prices",
        "sync_status",
        "key_metrics",
        "sync_jobs",
        "technical_indicators"
    ]
    
    # Check if all expected tables exist
    missing_tables = [table for table in expected_tables if table not in existing_tables]
    
    if not missing_tables:
        print("✓ Database already initialized - all tables exist")
        return
    
    print(f"Creating missing tables: {', '.join(missing_tables)}")
    Base.metadata.create_all(bind=engine)
    print("✓ Database tables created successfully!")


if __name__ == "__main__":
    init_db()