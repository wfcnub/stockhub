#!/usr/bin/env bash
# User-space PostgreSQL 18 for local tests. No root, no system install: Ubuntu's packages are
# downloaded with `apt-get download` and unpacked with `dpkg -x` into one gitignored folder.
# CI's PostgreSQL 18 service remains the real gate; this is a local convenience.
#
#   scripts/local-pg.sh setup     download, unpack, initdb, create role/db (idempotent)
#   scripts/local-pg.sh start     start the server (idempotent)
#   scripts/local-pg.sh stop      stop the server (idempotent)
#   scripts/local-pg.sh status    print running/stopped
#   scripts/local-pg.sh url       print the TEST_DATABASE_URL (contains the password)
#   scripts/local-pg.sh destroy   stop and delete the whole folder
#
# Environment:
#   LOCAL_PG_DIR   folder (default: backend/.local-pg)
#   LOCAL_PG_PORT  TCP port on 127.0.0.1 (default: 55432)
#
# Credentials: random, generated at setup, stored only in mode-600 files inside the folder.
# Nothing prints them except `url`, which is meant for `export TEST_DATABASE_URL=$(... url)`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_DIR="${LOCAL_PG_DIR:-$BACKEND_DIR/.local-pg}"
PG_PORT="${LOCAL_PG_PORT:-55432}"
PG_MAJOR=18
PACKAGES=(postgresql-18 postgresql-client-18 libpq5 liburing2)

DEB_DIR="$PG_DIR/debs"
ROOT_DIR="$PG_DIR/root"
DATA_DIR="$PG_DIR/data"
RUN_DIR="$PG_DIR/run"
LOG_FILE="$PG_DIR/postgres.log"
SUPER_PW_FILE="$PG_DIR/superuser.pw"
TEST_PW_FILE="$PG_DIR/stockhub_test.pw"
BIN_DIR="$ROOT_DIR/usr/lib/postgresql/$PG_MAJOR/bin"
TEST_ROLE=stockhub_test
TEST_DB=stockhub_test
MARKER_FILE="$PG_DIR/.stockhub-local-pg"
MARKER_TEXT="stockhub backend/scripts/local-pg.sh v1"

export LD_LIBRARY_PATH="$ROOT_DIR/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

die() { echo "local-pg: $*" >&2; exit 1; }
log() { echo "local-pg: $*" >&2; }

random_password() {
  # 32 alphanumeric characters: safe in URLs without escaping. Read a fixed amount first so
  # no pipe is cut early (a SIGPIPE would abort the script under pipefail).
  local raw
  raw="$(head -c 1024 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
  [[ ${#raw} -ge 32 ]] || die "could not generate a password"
  printf '%s\n' "${raw:0:32}"
}

# --- folder safety ----------------------------------------------------------------------------
# Every command works only on a folder this script created (it holds MARKER_FILE). setup may
# also adopt a missing or empty folder. Obviously wrong targets are refused outright.

resolved_dir() {
  realpath -m -- "$PG_DIR"
}

refuse_dangerous_dir() {
  local dir repo_root
  dir="$(resolved_dir)"
  repo_root="$(realpath -m -- "$BACKEND_DIR/..")"
  case "$dir" in
    / | "$(realpath -m -- "${HOME:-/}")" | "$BACKEND_DIR" | "$repo_root")
      die "refusing to use $dir as LOCAL_PG_DIR" ;;
  esac
}

has_marker() {
  [[ -f "$MARKER_FILE" ]] && [[ "$(head -n 1 "$MARKER_FILE")" == "$MARKER_TEXT" ]]
}

is_empty_dir() {
  [[ -d "$PG_DIR" ]] && [[ -z "$(ls -A -- "$PG_DIR")" ]]
}

require_ours() {
  refuse_dangerous_dir
  has_marker || die "$PG_DIR is not a local-pg folder (no marker); run: scripts/local-pg.sh setup"
}

claim_dir() {
  # For setup: create or adopt the folder, but never take over a foreign non-empty one.
  refuse_dangerous_dir
  if has_marker; then
    return
  fi
  if [[ -e "$PG_DIR" ]] && ! is_empty_dir; then
    die "refusing to set up in $PG_DIR: not empty and not created by this script"
  fi
  mkdir -p "$PG_DIR"
  printf '%s\n' "$MARKER_TEXT" >"$MARKER_FILE"
}

secure_files() {
  # Explicit modes: a default ACL on the parent directory can override the umask.
  chmod 700 "$PG_DIR"
  for f in "$SUPER_PW_FILE" "$TEST_PW_FILE"; do
    [[ -f "$f" ]] && chmod 600 "$f"
  done
  return 0
}

is_running() {
  [[ -d "$DATA_DIR" && -x "$BIN_DIR/pg_ctl" ]] && "$BIN_DIR/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1
}

superuser_psql() {
  PGPASSWORD="$(cat "$SUPER_PW_FILE")" "$BIN_DIR/psql" -X -q -v ON_ERROR_STOP=1 \
    -h "$RUN_DIR" -p "$PG_PORT" -U postgres -d postgres "$@"
}

install_binaries() {
  if [[ -x "$BIN_DIR/postgres" ]]; then
    return
  fi
  command -v apt-get >/dev/null || die "apt-get not found (Debian/Ubuntu only)"
  mkdir -p "$DEB_DIR" "$ROOT_DIR"
  log "downloading ${PACKAGES[*]} (user space, no install)"
  (cd "$DEB_DIR" && apt-get download "${PACKAGES[@]}" >/dev/null)
  for deb in "$DEB_DIR"/*.deb; do
    dpkg -x "$deb" "$ROOT_DIR"
  done
  rm -rf -- "$DEB_DIR"  # unpacked; the .deb files are no longer needed
  local version
  version="$("$BIN_DIR/postgres" --version)" || die "unpacked postgres does not run (missing system libraries?)"
  [[ "$version" == "postgres (PostgreSQL) $PG_MAJOR."* ]] || die "expected PostgreSQL $PG_MAJOR, got: $version"
  log "installed $version into $ROOT_DIR"
}

init_cluster() {
  if [[ -f "$DATA_DIR/PG_VERSION" ]]; then
    return
  fi
  (umask 077 && random_password >"$SUPER_PW_FILE" && random_password >"$TEST_PW_FILE")
  secure_files
  mkdir -p "$RUN_DIR"
  log "initdb (scram-sha-256)"
  "$BIN_DIR/initdb" -D "$DATA_DIR" -U postgres --auth=scram-sha-256 \
    --pwfile="$SUPER_PW_FILE" --encoding=UTF8 --locale=C.UTF-8 >/dev/null
}

start() {
  require_ours
  [[ -f "$DATA_DIR/PG_VERSION" ]] || die "not set up; run: scripts/local-pg.sh setup"
  if is_running; then
    return
  fi
  mkdir -p "$RUN_DIR"
  "$BIN_DIR/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -w -t 30 \
    -o "-c listen_addresses=127.0.0.1 -p $PG_PORT -k $RUN_DIR" start >/dev/null
  log "started on 127.0.0.1:$PG_PORT"
}

stop() {
  require_ours
  if is_running; then
    "$BIN_DIR/pg_ctl" -D "$DATA_DIR" -m fast -w stop >/dev/null
    log "stopped"
  fi
}

create_test_role() {
  local exists
  exists="$(superuser_psql -tA -c "SELECT 1 FROM pg_roles WHERE rolname = '$TEST_ROLE'")"
  if [[ "$exists" != "1" ]]; then
    # The password goes through an environment variable and psql's \getenv, so it never
    # appears in argv (process list) or on screen.
    LOCAL_PG_NEW_PW="$(cat "$TEST_PW_FILE")" superuser_psql <<SQL
\\getenv pw LOCAL_PG_NEW_PW
CREATE ROLE $TEST_ROLE LOGIN CREATEDB PASSWORD :'pw';
SQL
  fi
  exists="$(superuser_psql -tA -c "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'")"
  if [[ "$exists" != "1" ]]; then
    superuser_psql -c "CREATE DATABASE $TEST_DB OWNER $TEST_ROLE"
  fi
}

setup() {
  claim_dir
  install_binaries
  init_cluster
  secure_files
  local was_running=0
  is_running && was_running=1
  start
  create_test_role
  [[ $was_running == 1 ]] || stop
  log "ready: scripts/local-pg.sh start; export TEST_DATABASE_URL=\$(scripts/local-pg.sh url)"
}

url() {
  require_ours
  [[ -f "$TEST_PW_FILE" ]] || die "not set up; run: scripts/local-pg.sh setup"
  echo "postgresql://$TEST_ROLE:$(cat "$TEST_PW_FILE")@127.0.0.1:$PG_PORT/$TEST_DB"
}

destroy() {
  refuse_dangerous_dir
  if [[ ! -e "$PG_DIR" ]]; then
    return
  fi
  if is_empty_dir; then
    rmdir -- "$PG_DIR"
    log "deleted empty $PG_DIR"
    return
  fi
  has_marker || die "refusing to delete $PG_DIR: not created by this script (no marker)"
  stop
  rm -rf -- "$PG_DIR"
  log "deleted $PG_DIR"
}

case "${1:-}" in
  setup) setup ;;
  start) start ;;
  stop) stop ;;
  status) require_ours; if is_running; then echo running; else echo stopped; fi ;;
  url) url ;;
  destroy) destroy ;;
  *) echo "usage: $0 {setup|start|stop|status|url|destroy}" >&2; exit 2 ;;
esac
