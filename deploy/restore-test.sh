#!/usr/bin/env bash
# Restore test: load a dump into a throwaway PostgreSQL container and check it, without touching the
# live database. Usage: restore-test.sh [dump.sql.gz]   (default: newest local dump)
# Result goes to journald and to $STATE_DIR/last-restore-test, one line:
#   date=YYYY-MM-DD file=<dump> result=OK|FAIL tables=N rows=N
# The Proxmox host's nightly backup hook reads it with `pct pull` and fails when it is FAIL or over 35 days old.
set -euo pipefail
umask 027
OUT="${BACKUP_DIR:-/var/backups/stockhub}"
STATE_DIR="${STATE_DIR:-/var/lib/stockhub}"
IMAGE="${PG_IMAGE:-postgres:18-alpine}"   # keep the major in step with docker-compose.prod.yml
NAME="stockhub-restore-test-$$"
file="${1:-$(ls -1t "$OUT"/daily-*.sql.gz 2>/dev/null | head -n1 || true)}"
mkdir -p "$STATE_DIR"

record() { # result, detail (single line of key=value pairs, read by the host's nightly hook)
  printf 'date=%s file=%s result=%s %s\n' "$(date +%F)" "$(basename "${file:-none}")" "$1" "$2" \
    > "$STATE_DIR/last-restore-test.tmp"
  mv -f "$STATE_DIR/last-restore-test.tmp" "$STATE_DIR/last-restore-test"
  echo "restore test $1: $2"
}
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { record FAIL "tables=0 rows=0 error=\"${1// /_}\""; exit 1; }

[[ -n "$file" && -s "$file" ]] || fail "no dump found in $OUT"
gzip -t "$file" || fail "dump is not a valid gzip file"

# Throwaway server: no network, random password that is never stored, removed on exit
docker run -d --name "$NAME" --network none --memory 512m \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=restore_test "$IMAGE" >/dev/null \
  || fail "could not start the scratch container"
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d restore_test >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$NAME" pg_isready -U postgres -d restore_test >/dev/null 2>&1 || fail "scratch server did not start"

# The dump was made with --no-owner, so it restores as the scratch superuser
gunzip -c "$file" | docker exec -i "$NAME" psql -U postgres -d restore_test -v ON_ERROR_STOP=1 -q -o /dev/null \
  || fail "restore reported errors"

tables="$(docker exec "$NAME" psql -U postgres -d restore_test -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
[[ "${tables:-0}" -gt 0 ]] || fail "restored database has no tables"
rows="$(docker exec "$NAME" psql -U postgres -d restore_test -Atc \
  "SELECT coalesce(sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, relname), false, true, '')))[1]::text::bigint), 0)
   FROM pg_stat_user_tables")"
record OK "tables=${tables} rows=${rows}"
