# StockHub backend

FastAPI + SQLAlchemy 2.1 service. Python 3.14, managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
cd backend
uv sync                      # creates .venv from uv.lock (installs Python 3.14 if missing)
uv run uvicorn app.main:app --reload --port 8000
```

Dependencies live in `pyproject.toml`; `uv.lock` pins exact versions and is committed.
There is no `requirements.txt`. If a tool needs one, generate it from the lock:

```bash
uv export --frozen --no-dev --no-hashes -o requirements.txt
```

Add or change a dependency with `uv add <pkg>` (or `uv add --dev <pkg>`), then commit both files.

## Database

`DATABASE_URL` comes from the environment or `backend/.env`. PostgreSQL URLs written as
`postgresql://…` or `postgres://…` are normalised to `postgresql+psycopg://…` (psycopg 3),
so the driver is always explicit.

## Quality gates

```bash
uv run ruff check .          # lint
uv run ruff format --check . # formatting
uv run pytest                # tests
uv run mypy app indicators   # type check (informational, not yet blocking)
```

From the repo root, `pre-commit install` (or `uv run --directory backend pre-commit install`)
runs ruff on staged backend files; mypy is a manual hook: `pre-commit run mypy --hook-stage manual --all-files`.

## Settings

`CORS_ORIGINS` accepts either a comma-separated list (`http://a,http://b`) or a JSON list.
Unknown keys in `.env` (for example `ACTIVE_EXCHANGES`, written by `start.sh`) are ignored.

## Indicators

`indicators/` follows the canonical definitions and is checked three ways in
`tests/test_indicator_golden.py`: against TA-Lib 0.8.3 outputs committed in
`tests/fixtures/indicator_golden.json`, against an independent plain-Python reference
(`tests/reference/indicators_stdlib.py`) and against hand-computed vectors.

- EMA: k = 2/(n+1), seeded with the SMA of the first n closes (first value at bar n-1).
- RSI: Wilder smoothing; averages seeded with the mean of the first n changes, first value at
  bar n. A window with no gains and no losses gives 50 (TA-Lib's convention).
- MACD EMA mode: textbook EMA(fast) - EMA(slow), each seeded independently. TA-Lib seeds the
  fast EMA at bar slow-1 instead; the two agree to ~1e-12 after about 200 bars.
- MACD default mode (SMA) and VWAP are unchanged pending a product decision; the VWAP test
  is marked xfail.

Regenerate the fixture after a deliberate TA-Lib upgrade:
`uv run python -m tests.fixtures.generate_indicator_golden`.

**Stored values:** the EMA/RSI/MACD-EMA fixes change already stored indicator rows. Data
starts fresh, so after deploying run one full recompute:
`uv run python -m app.sync run --index JCI --full`.
