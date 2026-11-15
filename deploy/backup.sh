#!/usr/bin/env bash
# Nightly local pg_dump of the StockHub database: 7 daily + 4 weekly copies.
# LOCAL ONLY: the dumps sit on the same disk as the database until an off-host target exists.
set -euo pipefail
umask 077
DIR="${STOCKHUB_DIR:-/opt/stockhub}"
OUT="${BACKUP_DIR:-/var/backups/stockhub}"
mkdir -p "$OUT"

day="$(date +%F)"
tmp="$OUT/.daily-$day.sql.gz.tmp"
docker compose -f "$DIR/docker-compose.prod.yml" --env-file "$DIR/.env" --env-file "$DIR/release.env" \
  exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' \
  | gzip -9 > "$tmp"
gzip -t "$tmp"
[[ -s "$tmp" ]] || { echo "empty dump"; rm -f "$tmp"; exit 1; }
mv -f "$tmp" "$OUT/daily-$day.sql.gz"
# Sunday copy kept for 4 weeks
if [[ "$(date +%u)" == "7" ]]; then cp -f "$OUT/daily-$day.sql.gz" "$OUT/weekly-$day.sql.gz"; fi
find "$OUT" -name 'daily-*.sql.gz' -mtime +7 -delete
find "$OUT" -name 'weekly-*.sql.gz' -mtime +28 -delete
echo "backup ok: $OUT/daily-$day.sql.gz ($(du -h "$OUT/daily-$day.sql.gz" | cut -f1))"
