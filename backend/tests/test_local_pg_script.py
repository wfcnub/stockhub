"""Safety checks for scripts/local-pg.sh folder handling (no download, no server)."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND_DIR / "scripts" / "local-pg.sh"
MARKER = ".stockhub-local-pg"
MARKER_TEXT = "stockhub backend/scripts/local-pg.sh v1\n"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")


def run(command: str, pg_dir: Path | str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "LOCAL_PG_DIR": str(pg_dir)}
    return subprocess.run(
        [str(SCRIPT), command], env=env, capture_output=True, text=True, timeout=30
    )


def make_ours(path: Path) -> None:
    path.mkdir()
    (path / MARKER).write_text(MARKER_TEXT)
    (path / "data").mkdir()


def test_foreign_non_empty_dir_is_refused(tmp_path: Path) -> None:
    foreign = tmp_path / "important"
    foreign.mkdir()
    (foreign / "keep.txt").write_text("precious")
    for command in ("destroy", "setup", "start", "stop", "status", "url"):
        result = run(command, foreign)
        assert result.returncode != 0, command
        assert "refusing" in result.stderr or "not a local-pg folder" in result.stderr, command
    assert (foreign / "keep.txt").read_text() == "precious"


def test_wrong_marker_content_is_refused(tmp_path: Path) -> None:
    fake = tmp_path / "fake"
    fake.mkdir()
    (fake / MARKER).write_text("something else\n")
    (fake / "keep.txt").write_text("x")
    assert run("destroy", fake).returncode != 0
    assert (fake / "keep.txt").exists()


def test_empty_dir_is_ok(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    result = run("destroy", empty)
    assert result.returncode == 0, result.stderr
    assert not empty.exists()


def test_missing_dir_is_ok(tmp_path: Path) -> None:
    assert run("destroy", tmp_path / "nope").returncode == 0


def test_our_dir_is_destroyed(tmp_path: Path) -> None:
    ours = tmp_path / "local-pg"
    make_ours(ours)
    result = run("destroy", ours)
    assert result.returncode == 0, result.stderr
    assert not ours.exists()


def test_our_dir_status_without_server(tmp_path: Path) -> None:
    ours = tmp_path / "local-pg"
    make_ours(ours)
    result = run("status", ours)
    assert (result.returncode, result.stdout.strip()) == (0, "stopped")


@pytest.mark.parametrize(
    "target",
    [
        "/",
        os.path.expanduser("~"),
        str(BACKEND_DIR),
        str(BACKEND_DIR.parent),
        f"{BACKEND_DIR}/scripts/..",  # resolves to the backend dir
    ],
)
def test_dangerous_targets_are_refused(target: str) -> None:
    for command in ("destroy", "setup"):
        result = run(command, target)
        assert result.returncode != 0, (command, target)
        assert "refusing to use" in result.stderr, (command, target)
