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
  - `frontend/src/types/index.ts`: request/response types (must stay contract-aligned).
- Root scripts:
  - `start.sh`: one-command local startup (DB + backend + frontend).
  - `stop.sh`: stop local services.

## 3) Runtime and Commands

- Full stack local run:
  - `./start.sh`
  - `./stop.sh`
- Backend local:
  - `cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000`
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