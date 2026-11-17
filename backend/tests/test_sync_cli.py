import re

import pytest

from app.sync.__main__ import build_parser
from app.sync.runner import new_sync_id


def test_sync_ids_are_unique_and_readable() -> None:
    ids = {new_sync_id() for _ in range(2000)}
    assert len(ids) == 2000  # same second, still distinct
    assert all(re.fullmatch(r"sync_\d{8}_\d{6}_[0-9a-f]{8}", i) for i in ids)
    assert all(len(i) <= 100 for i in ids)  # sync_jobs.sync_id is VARCHAR(100)


def test_run_requires_exactly_one_target() -> None:
    parser = build_parser()
    assert parser.parse_args(["run", "--index", "JCI"]).index_code == "JCI"
    assert parser.parse_args(["run", "--sync-id", "sync_x"]).sync_id == "sync_x"
    with pytest.raises(SystemExit):
        parser.parse_args(["run"])
    with pytest.raises(SystemExit):
        parser.parse_args(["run", "--index", "JCI", "--sync-id", "sync_x"])


def test_run_validates_start_date() -> None:
    parser = build_parser()
    args = parser.parse_args(["run", "--index", "JCI", "--start-date", "2024-01-31"])
    assert args.start_date == "2024-01-31"
    with pytest.raises(SystemExit):
        parser.parse_args(["run", "--index", "JCI", "--start-date", "31-01-2024"])


def test_recover_command_parses() -> None:
    assert build_parser().parse_args(["recover"]).command == "recover"
