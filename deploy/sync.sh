#!/usr/bin/env bash
# Starts the daily data sync through the backend API (the backend is not published, so the
# request is made from inside the backend container). The API is a background job: this only starts it.
set -euo pipefail
DIR="${STOCKHUB_DIR:-/opt/stockhub}"
INDEX_CODE="${SYNC_INDEX_CODE:-JCI}"
INDEX_NAME="${SYNC_INDEX_NAME:-Jakarta Composite Index}"
YF_SUFFIX="${SYNC_YF_SUFFIX:-.JK}"

docker compose -f "$DIR/docker-compose.prod.yml" --env-file "$DIR/.env" --env-file "$DIR/release.env" \
  exec -T -e INDEX_CODE="$INDEX_CODE" -e INDEX_NAME="$INDEX_NAME" -e YF_SUFFIX="$YF_SUFFIX" backend python - <<'PY'
import json, os, urllib.error, urllib.parse, urllib.request

base = "http://127.0.0.1:8000/api/v1/sync"

def post(path, **params):
    url = f"{base}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]

# Idempotent: 400 means the index already exists
print(post("init-index", code=os.environ["INDEX_CODE"], name=os.environ["INDEX_NAME"],
           yfinance_suffix=os.environ["YF_SUFFIX"]))
status, body = post("start", index_code=os.environ["INDEX_CODE"])
print(status, body)
raise SystemExit(0 if status == 200 else 1)
PY
