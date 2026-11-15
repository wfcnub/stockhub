#!/usr/bin/env bash
# StockHub pull-based deploy: find the newest release tag, pull its images, restart, health-check,
# roll back on failure. Runs on the deployment guest from stockhub-deploy.timer (see deploy/README.md).
# Needs: docker (+ compose plugin), git, curl. Reads /opt/stockhub/.env; never prints it.
set -euo pipefail

DIR="${STOCKHUB_DIR:-/opt/stockhub}"
REPO_URL="https://github.com/wfcnub/stockhub"
RAW_URL="https://raw.githubusercontent.com/wfcnub/stockhub"
IMAGE_PREFIX="ghcr.io/wfcnub/stockhub"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

cd "$DIR"
exec 9>"$DIR/.deploy.lock"
flock -n 9 || { echo "another deploy is running"; exit 0; }

compose() { docker compose -f "$DIR/docker-compose.prod.yml" --env-file "$DIR/.env" --env-file "$DIR/release.env" "$@"; }

# Which tag? A pin file wins (hold or manual rollback); otherwise the highest vX.Y.Z tag.
if [[ -s "$DIR/pin" ]]; then
  tag="$(tr -d '[:space:]' < "$DIR/pin")"
else
  tag="$(git ls-remote --tags --refs "$REPO_URL" 'v*' | sed 's#.*refs/tags/##' \
         | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1 || true)"
fi
[[ -n "$tag" ]] || { echo "no release tag found yet"; exit 0; }
version="${tag#v}"

current="$(cat "$DIR/deployed-tag" 2>/dev/null || true)"
if [[ "$current" == "$version" ]]; then echo "already on $version"; exit 0; fi

# Images are built by the release workflow after the tag is pushed: wait for both
for name in backend frontend; do
  if ! docker manifest inspect "$IMAGE_PREFIX-$name:$version" >/dev/null 2>&1; then
    echo "image $IMAGE_PREFIX-$name:$version not published yet; will retry"
    exit 0
  fi
done

echo "deploying $version (was ${current:-none})"
cp -f docker-compose.prod.yml docker-compose.prod.yml.prev 2>/dev/null || true
cp -f release.env release.env.prev 2>/dev/null || true
curl -fsSL "$RAW_URL/$tag/docker-compose.prod.yml" -o docker-compose.prod.yml.new
mv -f docker-compose.prod.yml.new docker-compose.prod.yml
echo "STOCKHUB_TAG=$version" > release.env

rollback() {
  echo "deploy of $version FAILED"
  if [[ -n "$current" && -f docker-compose.prod.yml.prev && -f release.env.prev ]]; then
    echo "rolling back to $current"
    cp -f docker-compose.prod.yml.prev docker-compose.prod.yml
    cp -f release.env.prev release.env
    compose up -d --remove-orphans || true
  fi
  exit 1
}

compose pull || rollback
compose up -d --wait db || rollback

# Create or update tables with the new image before it serves traffic (idempotent)
compose run --rm --no-deps backend python init_db.py || rollback

compose up -d --remove-orphans || rollback

deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
  ok=1
  for svc in db backend frontend; do
    cid="$(compose ps -q "$svc")"
    status="$( [[ -n "$cid" ]] && docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none )"
    [[ "$status" == "healthy" ]] || ok=0
  done
  (( ok )) && break
  (( $(date +%s) > deadline )) && rollback
  sleep 5
done

echo "$version" > "$DIR/deployed-tag"
docker image prune -f >/dev/null
echo "deployed $version"
