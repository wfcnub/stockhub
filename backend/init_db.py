"""
Database initialization and migration script
Run this to create all tables if they don't exist and perform migrations
"""
from sqlalchemy import inspect, text
from app.db.database import engine, Base, SessionLocal
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
    
    if missing_tables:
        print(f"Creating missing tables: {', '.join(missing_tables)}")
        Base.metadata.create_all(bind=engine)
        print("✓ Database tables created successfully!")
    else:
        print("✓ Database already initialized - all tables exist")
    
    # Run migrations
    run_migrations()


def run_migrations():
    """Run database migrations for schema changes"""
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        
        # Migration 1: Add yfinance_suffix column to indexes table
        if "indexes" in inspector.get_table_names():
            columns = [col["name"] for col in inspector.get_columns("indexes")]
            
            if "yfinance_suffix" not in columns:
                print("Running migration: Adding yfinance_suffix column to indexes table")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE indexes ADD COLUMN yfinance_suffix VARCHAR(10) DEFAULT ''"))
                    conn.commit()
                print("✓ Migration complete: yfinance_suffix column added")
        
        # Migration 2: Migrate IDX index code to JCI
        existing_idx = db.query(Index).filter(Index.code == "IDX").first()
        if existing_idx:
            print("Running migration: Migrating IDX index code to JCI")
            # Check if JCI already exists
            existing_jci = db.query(Index).filter(Index.code == "JCI").first()
            if existing_jci:
                # Merge IDX into JCI - move all tickers to JCI
                db.query(Ticker).filter(Ticker.index_id == existing_idx.id).update(
                    {"index_id": existing_jci.id}
                )
                db.delete(existing_idx)
                print(f"✓ Migration complete: IDX deleted, tickers moved to JCI")
            else:
                # Just rename IDX to JCI
                existing_idx.code = "JCI"
                existing_idx.yfinance_suffix = ".JK"
                print("✓ Migration complete: IDX renamed to JCI with suffix .JK")
            db.commit()
            
    except Exception as e:
        print(f"Warning: Migration error (may be expected for new databases): {e}")
    finally:
        db.close()


if __name__ == "__main__":
    init_db()