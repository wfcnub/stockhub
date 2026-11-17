#!/usr/bin/env bash
# Daily data sync with the standalone worker CLI (python -m app.sync run --index <code>), run in a
# one-shot backend container on the compose network. The API stays untouched.
# Exit codes of the worker: 0 ok or cancelled, 1 failed, 2 done but some tickers failed (warning),
# 3 another sync for the index is already running (skip). Only 1 (or an infrastructure error) fails this unit.
set -euo pipefail

DIR="${STOCKHUB_DIR:-/opt/stockhub}"
INDEX_CODE="${SYNC_INDEX_CODE:-JCI}"
INDEX_NAME="${SYNC_INDEX_NAME:-Jakarta Composite Index}"
YF_SUFFIX="${SYNC_YF_SUFFIX:-.JK}"

compose() { docker compose -f "$DIR/docker-compose.prod.yml" --env-file "$DIR/.env" --env-file "$DIR/release.env" "$@"; }

# The worker needs the index row to exist: create it once, idempotently (no error if present)
compose run --rm --no-deps -T \
  -e INDEX_CODE="$INDEX_CODE" -e INDEX_NAME="$INDEX_NAME" -e YF_SUFFIX="$YF_SUFFIX" \
  backend python - <<'PY'
import os

from sqlalchemy import select

from app.db.database import SessionLocal
from app.models import Index

code = os.environ["INDEX_CODE"].upper()
with SessionLocal() as db:
    if db.scalar(select(Index).where(Index.code == code)) is None:
        db.add(Index(code=code, name=os.environ["INDEX_NAME"],
                     yfinance_suffix=os.environ["YF_SUFFIX"], is_active=True))
        db.commit()
        print(f"created index {code}")
    else:
        print(f"index {code} exists")
PY

set +e
compose run --rm --no-deps -T backend python -m app.sync run --index "$INDEX_CODE"
rc=$?
set -e

case "$rc" in
  0) echo "sync ok" ;;
  2) echo "WARNING: sync finished but some tickers failed (see sync_status and sync_jobs.error_message)"; exit 0 ;;
  3) echo "another sync for $INDEX_CODE is already running; skipping"; exit 0 ;;
  *) echo "ERROR: sync failed (exit $rc)"; exit 1 ;;
esac
