"""Sync worker CLI.

    uv run python -m app.sync run --index JCI          # new job for an index (timer / compose)
    uv run python -m app.sync run --sync-id <id>       # run a pending job created by the API
    uv run python -m app.sync recover                  # mark abandoned jobs as failed

Options for `run`: --start-date YYYY-MM-DD (first sync only), --workers N,
--skip-ticker-list, --full (rewrite all indicator rows).

Exit codes: 0 completed or cancelled, 1 failed, 2 completed with some ticker failures,
3 another sync for the index is already running.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from typing import Optional, Sequence


def _iso_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"expected YYYY-MM-DD, got {value!r}") from exc
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.sync", description="StockHub sync worker")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="run one sync job")
    target = run.add_mutually_exclusive_group(required=True)
    target.add_argument("--index", dest="index_code", help="index code, e.g. JCI")
    target.add_argument("--sync-id", help="run an existing pending job (created by the API)")
    run.add_argument("--start-date", type=_iso_date, help="first-sync start date (YYYY-MM-DD)")
    run.add_argument("--workers", type=int, default=None, help="parallel ticker downloads")
    run.add_argument("--skip-ticker-list", action="store_true", help="don't refresh constituents")
    run.add_argument("--full", action="store_true", help="rewrite all indicator rows")

    sub.add_parser("recover", help="mark sync jobs without a live worker as failed")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    from app.db.database import SessionLocal
    from app.sync.runner import recover_stale_jobs, run_job

    if args.command == "recover":
        recovered = recover_stale_jobs(SessionLocal)
        print(f"recovered {len(recovered)} job(s): {', '.join(recovered) or '-'}")
        return 0

    recover_stale_jobs(SessionLocal)
    outcome = run_job(
        SessionLocal,
        index_code=args.index_code,
        sync_id=args.sync_id,
        start_date=args.start_date,
        workers=args.workers,
        skip_ticker_list=args.skip_ticker_list,
        full_recompute=args.full,
    )
    print(
        f"sync_id={outcome.sync_id} status={outcome.status} processed={outcome.processed}/"
        f"{outcome.total} failed={outcome.failed}"
        + (f" message={outcome.message}" if outcome.message else "")
    )
    return outcome.exit_code


if __name__ == "__main__":
    sys.exit(main())
