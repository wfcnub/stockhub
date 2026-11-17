# Deployment (homelab `stockhub` guest)

Pull-based: nothing in GitHub can reach the homelab. A systemd timer on the guest checks for a new
release tag, pulls the matching images from GHCR, restarts the stack, health-checks it and rolls
back on failure. Public URL: `https://stockhub.hollowsyde.dev` through the Cloudflare tunnel with
Cloudflare Access in front. The tunnel points at `http://<guest>:3000` (the frontend; it proxies `/api`).

## Release flow
1. PRs run CI (`.github/workflows/ci.yml`, `security.yml`) against `master`.
2. A merge to `master` publishes `ghcr.io/wfcnub/stockhub-{backend,frontend}:sha-<short>` and `edge`. These are **not deployed**.
3. Tagging `vX.Y.Z` on `master` publishes `X.Y.Z`, `X.Y` after a Trivy scan. The timer deploys the highest `vX.Y.Z` tag.
4. Hold or roll back by hand: put a tag (for example `v1.2.0`) in `/opt/stockhub/pin`; remove the file to follow releases again.

## Layout on the guest (`/opt/stockhub`, owned by the `stockhub` user, mode 750)
| Path | What |
|---|---|
| `.env` | Real settings, mode 600, **not in git** (template: `deploy/.env.example`) |
| `bin/` | `deploy.sh`, `backup.sh`, `sync.sh` (copies of `deploy/*.sh`) |
| `docker-compose.prod.yml`, `release.env` | Fetched per release by `deploy.sh`; `*.prev` kept for rollback |
| `deployed-tag`, `pin` | State files |
| `/var/backups/stockhub` | Nightly dumps (7 daily + 4 weekly) |

## One-time setup (done by Elymas, after Aditya's approval)
- Docker Engine + Compose plugin, `git`, `curl`; user `stockhub` in group `docker` (root-equivalent, acceptable on this single-purpose guest).
- Copy `deploy/*.sh` to `/opt/stockhub/bin/`, `deploy/*.service` and `*.timer` to `/etc/systemd/system/`, create `/opt/stockhub/.env`.
- Create `/var/backups/stockhub` and `/var/lib/stockhub` (both stockhub:stockhub, 750).
- Enable `stockhub-backup.timer`, `stockhub-restore-test.timer` and `stockhub-sync.timer`. Enable `stockhub-deploy.timer` only after the first release tag's images exist.
- Guest Proxmox firewall: inbound 3000 from the cloudflared CT and codenv only; SSH from codenv and the PVE host only.

## Requirements this puts on the app
- Backend `GET /health` (root path) returning 200 only when the database answers: image healthcheck, deploy health gate and Elymas's monitor use it. **Without it the deploy rolls back.**
- `backend/uv.lock` committed; until then the backend image is not built or published.
- Schema: `deploy.sh` runs `alembic upgrade head` in a one-shot backend container before the stack restarts (idempotent; migrations live in `backend/migrations`, the image carries `alembic.ini` and `migrations/`).
- Daily sync: `sync.sh` creates the index row if missing, then runs `python -m app.sync run --index JCI` in a one-shot backend container (Mon-Fri 17:30 WIB, after the 17:00 WIB final-bar cutoff). Worker exit codes: `0` ok or cancelled; `1` failed (the unit fails, so it shows in `systemctl --failed`); `2` finished but some tickers failed (logged as a warning, unit succeeds; details in `sync_status` and `sync_jobs.error_message`); `3` another sync is already running (skipped, unit succeeds). `POST /api/v1/sync/start` still works for manual runs from inside the backend.
- The API has **no authentication**. Access (edge) is the only gate, and Next must forward only GET/HEAD to `/api` until the admin token exists. The backend and database publish no ports.

## Backups
- `backup.sh` (00:30 WIB) writes `pg_dump` files to `/var/backups/stockhub`: `daily-` (7 kept), `weekly-` (Sundays, 4 kept), `monthly-` (1st, about 3 months). In-progress files are hidden `.daily-*.tmp`.
- The directory is `stockhub:stockhub`, mode 750, files 640. The dumps hold all data but no secrets.
- **Off-host copy (Aditya's Google Drive):** done from the Proxmox host, not from this guest, so no Drive token lives on the internet-facing guest. A hook at the end of Elymas's nightly vzdump job (01:00 WIB) runs `pct pull` for the finished `daily-*`, `weekly-*` and `monthly-*.sql.gz` files (older than 1 minute, hidden `.tmp` files ignored) and `rclone copy`s them to an encrypted crypt remote with the `drive.file` scope. Drive retention is pruned by the hook: daily 14 days, weekly 90 days, monthly 400 days. The Drive token and crypt config stay root-only on the host; the crypt password is kept in the OpenBot Vault and an offline copy with Aditya (without it the backups are unrecoverable). The dump therefore has to finish well before 01:00 WIB; a late dump is simply picked up the next night.
- **Restore test:** `restore-test.sh` (monthly, 1st at 04:00 WIB, `stockhub-restore-test.timer`) restores the newest dump into a throwaway `postgres:18-alpine` container (no network, random password) and checks tables and row counts. Result: journald and a one-line `/var/lib/stockhub/last-restore-test` (`date=YYYY-MM-DD file=... result=OK|FAIL tables=N rows=N`); the host's nightly hook reads it with `pct pull` and fails (so the health check warns) when it says FAIL or is older than 35 days. `restore-test.sh <file>` tests any dump, which is how Elymas runs the Drive drill (download through crypt on the host, push to the guest as a 640 file, test, delete) after the first real backup and then quarterly.
- Restore into the live database (an emergency, after stopping the backend): `gunzip -c daily-YYYY-MM-DD.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env --env-file release.env exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`. The dumps use `--clean --if-exists`. A major PostgreSQL upgrade is dump and restore into a new `postgres:<major>` volume, never a data volume mounted on a different major.

## Not tested yet
The images and compose files have not been run: codenv has no Docker. The first real test is the CI build, then the first deploy on the guest.
