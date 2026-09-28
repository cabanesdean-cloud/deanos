import pytest
from fastapi.testclient import TestClient

from deanos_engine.api import app
from deanos_engine.data import Snapshot, set_snapshot

client = TestClient(app)
P = "AAA:50,AGG:30,QQQ:20"
BASE = "/deanos/api"


def test_health_without_data() -> None:
    set_snapshot(None)
    body = client.get(f"{BASE}/health").json()
    assert body["status"] == "ok"
    assert body["python"].startswith("3.13")


def test_routes_live_under_public_prefix() -> None:
    assert client.get("/health").status_code == 404


@pytest.mark.usefixtures("installed_snapshot")
@pytest.mark.parametrize(
    ("path", "keys"),
    [
        ("overview", {"metrics", "growth", "holdings", "data_quality"}),
        ("risk", {"estimates", "backtest", "contributions_95"}),
        ("volatility", {"forecasts", "term_structure", "diagnostics", "holdings"}),
        ("simulation", {"fan", "final", "probabilities", "assumptions"}),
        ("regimes", {"current", "history", "stability", "portfolio_by_regime"}),
        ("factors", {"loadings", "alpha", "r_squared", "window"}),
        ("stress", {"scenarios", "custom", "sensitivities"}),
    ],
)
def test_sections(path: str, keys: set[str]) -> None:
    resp = client.get(f"{BASE}/{path}", params={"p": P})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert keys <= set(body)
    assert body["as_of"] == "2026-09-25"
    assert "s-maxage" in resp.headers["cache-control"]


@pytest.mark.usefixtures("installed_snapshot")
def test_compare() -> None:
    resp = client.get(f"{BASE}/compare", params={"a": "SPY:1", "b": "SPY:60,AGG:40"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["difference"]["volatility"] < 0
    assert len(body["growth"]["a"]) == len(body["growth"]["b"])


@pytest.mark.usefixtures("installed_snapshot")
def test_universe_and_demos() -> None:
    uni = client.get(f"{BASE}/universe").json()
    assert {r["ticker"] for r in uni["tickers"]} >= {"SPY", "AGG"}
    demos = client.get(f"{BASE}/demos").json()["demos"]
    assert {d["id"] for d in demos} == {"balanced", "growth", "defensive"}


@pytest.mark.usefixtures("installed_snapshot")
@pytest.mark.parametrize(
    ("params", "status", "fragment"),
    [
        ({"p": "SPY:-1"}, 400, "positive"),
        ({"p": "ZZZZ:1"}, 400, "Not in the data universe"),
        ({"p": "CCC:1"}, 400, "trading days"),
        ({"p": "SPY:1", "years": 1}, 422, ""),
        ({}, 422, ""),
    ],
)
def test_bad_input(params: dict[str, object], status: int, fragment: str) -> None:
    resp = client.get(f"{BASE}/overview", params=params)
    assert resp.status_code == status
    if fragment:
        assert fragment in resp.json()["error"]


@pytest.mark.usefixtures("installed_snapshot")
def test_simulation_size_is_bounded() -> None:
    resp = client.get(f"{BASE}/simulation", params={"p": "SPY:1", "paths": 10000, "horizon": 1260})
    assert resp.status_code == 400
    assert "at most" in resp.json()["error"]


def test_data_unavailable_returns_503(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    set_snapshot(None)
    monkeypatch.setenv("DEANOS_DATA_PATH", str(tmp_path / "missing.npz"))
    resp = client.get(f"{BASE}/overview", params={"p": "SPY:1"})
    assert resp.status_code == 503
    assert "unavailable" in resp.json()["error"]


def test_snapshot_fixture_is_isolated(snapshot: Snapshot) -> None:
    assert "SPY" in snapshot.prices
