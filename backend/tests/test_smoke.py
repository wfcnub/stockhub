import tomllib
from pathlib import Path

from fastapi.testclient import TestClient

from app import __version__
from app.main import app

client = TestClient(app)


def test_app_imports_with_project_version() -> None:
    pyproject = tomllib.loads((Path(__file__).parents[1] / "pyproject.toml").read_text())
    assert __version__ == pyproject["project"]["version"]
    assert app.version == __version__


def test_root_reports_version() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "StockHub API", "version": __version__}


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_available_types_is_not_shadowed_by_ticker_route() -> None:
    # Regression: "/indicators/{ticker_symbol}" used to capture this path.
    response = client.get("/api/v1/indicators/available-types")
    assert response.status_code == 200
    body = response.json()
    assert "indicator_types" in body
    assert {item["type"] for item in body["indicator_types"]} >= {"sma", "ema", "macd", "rsi", "vwap"}


def test_health_returns_503_when_database_is_down(monkeypatch) -> None:
    import app.main as main_module

    class _BrokenEngine:
        def connect(self):
            raise ConnectionError("db down")

    monkeypatch.setattr(main_module, "engine", _BrokenEngine())
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy", "detail": "database unavailable"}
