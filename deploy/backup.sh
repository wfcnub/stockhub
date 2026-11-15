#!/usr/bin/env bash
# Nightly local pg_dump of the StockHub database: 7 daily + 4 weekly + 3 monthly copies.
# The off-host copy is made from the Proxmox host (Elymas): `pct pull` plus rclone to Google Drive after
# the 01:00 WIB vzdump job, so no Drive token lives on this guest. Dumps hold all data (no secrets):
# dir is stockhub:stockhub mode 750, files 640.
set -euo pipefail
umask 027
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
# First of the month copy kept for about 3 months
if [[ "$(date +%d)" == "01" ]]; then cp -f "$OUT/daily-$day.sql.gz" "$OUT/monthly-$(date +%Y-%m).sql.gz"; fi
find "$OUT" -name 'daily-*.sql.gz' -mtime +7 -delete
find "$OUT" -name 'monthly-*.sql.gz' -mtime +95 -delete
find "$OUT" -name 'weekly-*.sql.gz' -mtime +28 -delete
echo "backup ok: $OUT/daily-$day.sql.gz ($(du -h "$OUT/daily-$day.sql.gz" | cut -f1))"
