# StockHub Agent Brief

This file briefs coding agents working in this repository.

## 1) Mission and Guardrails

- Implement features and fixes with optimal scope for the requirement and current repo context (minimal if possible).
- Prefer solutions that reduce long-term maintenance and operational risk at the current project scale.
- Ask focused clarifying questions when requirements, constraints, or success criteria are ambiguous.
- Avoid silent assumptions. If an assumption is needed to unblock progress, state it explicitly and keep it reversible.
- Keep backend, frontend, and docs aligned at all times.
- Treat these as source-of-truth docs:
  - `API_CONTRACT.md` for API behavior, request/response shapes, defaults, and errors.
  - `DB_DESIGN.md` for schema, relationships, constraints, and SQL DDL.
  - `AGENTS.md` for repo workflow, conventions, and agent operating rules.

## 2) Repo Map (Which Way Is Which)

- `backend/`: FastAPI app + SQLAlchemy models + sync/indicator services.
  - `backend/app/main.py`: app entrypoint, CORS, router wiring.
  - `backend/app/routers/`: HTTP endpoints (`stats`, `indexes`, `tickers`, `sync`, `divergences`, etc.).
  - `backend/app/models/`: DB models (`indexes`, `tickers`, `prices`, `key_metrics`, `technical_indicators`, `sync_status`, `sync_jobs`).
  - `backend/app/services/`: domain logic (sync pipeline, indicator calculations, divergence detection).
  - `backend/indicators/`: indicator implementations and registry.
- `frontend/`: Next.js 14 app (App Router) + TypeScript UI.
  - `frontend/src/app/`: route pages (`/`, `/tickers`, `/tickers/[symbol]`, `/screener`).
  - `frontend/src/components/`: feature components (landing, charts, screener, ticker).
  - `frontend/src/lib/api.ts`: frontend API client (must stay contract-aligned).
  - `frontend/src/lib/chartTheme.ts`: chart colours derived from the CSS variables in `globals.css`.
  - `frontend/src/lib/` must stay tracked: Python ignore rules in `.gitignore` are anchored to `/backend/`; never add unanchored `lib/`, `build/`, `dist/` or `env/` rules.
  - `frontend/src/types/index.ts`: request/response types (must stay contract-aligned).
- Root scripts:
  - `start.sh`: one-command local startup (DB + backend + frontend).
  - `stop.sh`: stop local services.

## 3) Runtime and Commands

- Full stack local run:
  - `./start.sh`
  - `./stop.sh`
- Backend local (Python 3.14, managed by uv; dependencies in `backend/pyproject.toml` and `backend/uv.lock`):
  - `cd backend && uv sync`
  - `cd backend && uv run alembic upgrade head` (PostgreSQL 18 only; `DATABASE_URL` required)
  - Local test PostgreSQL (user-space, no root, gitignored `backend/.local-pg/`): `cd backend && scripts/local-pg.sh setup`, then `LOCAL_PG=1 uv run pytest`; remove it with `scripts/local-pg.sh destroy`. `TEST_DATABASE_URL` takes precedence; CI uses its own PostgreSQL 18 service.
  - `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Backend quality gates (CI runs the same):
  - `cd backend && uv run ruff check . && uv run ruff format --check .`
  - `cd backend && uv run pytest`
  - `cd backend && uv run mypy app` (informational until the models move to `Mapped[]`)
  - Indicator golden tests (`tests/test_indicator_golden.py`) compare against committed TA-Lib vectors, a plain-Python reference and hand-computed cases. Regenerate the fixture only after a deliberate TA-Lib upgrade: `cd backend && uv run python -m tests.fixtures.generate_indicator_golden`. After an indicator fix is deployed, recompute stored values with `uv run python -m app.sync run --index JCI --full`.
  - Add or change dependencies with `uv add` / `uv add --dev`, never by hand-editing `uv.lock`.
  - Schema changes: edit the models, `uv run alembic revision --autogenerate -m "..."`, review it, update `DB_DESIGN.md`. PostgreSQL tests run when `TEST_DATABASE_URL` points at a PostgreSQL 18 server whose role has CREATEDB.
- Data sync (separate worker process; the API never runs syncs itself):
  - `cd backend && uv run python -m app.sync run --index JCI` (options: `--start-date`, `--workers`, `--skip-ticker-list`, `--full`)
  - `cd backend && uv run python -m app.sync recover` (mark jobs without a live worker as failed)
  - Exit codes: 0 completed or cancelled, 1 failed, 2 completed with some ticker failures, 3 another sync for the index is running.
- Frontend local:
  - `cd frontend && npm run dev`
- Frontend quality gates:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`

## 4) API/DB Alignment Rules

- All public API routes are currently under `/api/v1`.
- If endpoint behavior changes (params, defaults, response fields, status mapping, errors), update:
  - router/service implementation,
  - `frontend/src/lib/api.ts`,
  - `frontend/src/types/index.ts`,
  - `API_CONTRACT.md`.
- If model/table/constraint/index changes, update:
  - SQLAlchemy models,
  - any impacted routers/services,
  - `DB_DESIGN.md` (table docs + SQL schema + changelog).

## 5) Change Checklist (Mandatory for Every Change)

At the end of every task, perform this checklist before finishing:

1. Clarification check:
  - Is any requirement ambiguous or under-specified?
  - If yes, ask necessary questions before implementation.
2. Impact scan check:
  - Check whether the change impacts backend routes/services/models, frontend API/types/pages, scripts, tests, and docs.
  - If yes, include all affected areas in the change.
3. Options and trade-off check:
  - If multiple valid approaches exist, present concise options with trade-offs and a recommendation.
4. Scale sanity check:
  - Assess whether the proposed approach is over-engineered for current scale.
  - If overkill, propose a leaner alternative and explain the trade-off.
5. API contract check:
   - Did API surface or behavior change?
   - If yes, update `API_CONTRACT.md` (and bump changelog entry).
6. DB design check:
   - Did schema/model/constraint/index semantics change?
   - If yes, update `DB_DESIGN.md` (and bump changelog entry).
7. Agent brief check:
  - Did workflow, architecture map, conventions, or guardrails change?
  - If yes, update `AGENTS.md`.
8. Frontend-backend sync check:
   - Ensure `frontend/src/lib/api.ts` and `frontend/src/types/index.ts` still match backend behavior.
9. Verification check:
   - Run the smallest relevant validation (lint/build/targeted run) and record what was verified.

If a document does not require changes, explicitly state: "checked, no update required" in your final summary.

## 6) Practical Conventions

- Prefer clear, cohesive diffs sized for correctness and maintainability; minimal changes are preferred only when they are also optimal.
- Preserve legacy compatibility when contract requires it (example: legacy sync status values mapped to API contract values).
- Keep error responses in `{ "detail": ... }` shape.
- Keep defaults aligned with contract docs (pagination, range, MA periods, screener limits).
- For divergence features, preserve strategy metadata fields expected by frontend.

## 7) Definition of Done

A change is done only when code + docs + contract alignment are complete, and the mandatory checklist above is satisfied.