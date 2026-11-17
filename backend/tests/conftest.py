import os

# Never let tests touch a real database or a developer's backend/.env values.
# Engine creation is lazy, so an in-memory SQLite URL is enough for import-level smoke tests.
os.environ.setdefault("DATABASE_URL", "sqlite://")
