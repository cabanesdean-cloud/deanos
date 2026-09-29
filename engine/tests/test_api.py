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
        (
            "volatility",
            {"forecasts", "term_structure", "diagnostics", "holding_volatility", "holdings"},
        ),
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


def test_bad_input_is_400_even_without_data(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    set_snapshot(None)
    monkeypatch.setenv("DEANOS_DATA_PATH", str(tmp_path / "missing.npz"))
    assert client.get(f"{BASE}/overview", params={"p": "SPY:-1"}).status_code == 400
    assert client.get(f"{BASE}/compare", params={"a": "SPY:1", "b": "x"}).status_code == 400


def test_data_unavailable_returns_503(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    set_snapshot(None)
    monkeypatch.setenv("DEANOS_DATA_PATH", str(tmp_path / "missing.npz"))
    resp = client.get(f"{BASE}/overview", params={"p": "SPY:1"})
    assert resp.status_code == 503
    assert "unavailable" in resp.json()["error"]


def test_snapshot_fixture_is_isolated(snapshot: Snapshot) -> None:
    assert "SPY" in snapshot.prices


@pytest.mark.usefixtures("installed_snapshot")
def test_security_headers() -> None:
    resp = client.get(f"{BASE}/overview", params={"p": "SPY:1"})
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert resp.headers["x-frame-options"] == "DENY"
    assert "set-cookie" not in resp.headers


@pytest.mark.usefixtures("installed_snapshot")
def test_validation_errors_are_plain_json() -> None:
    resp = client.get(f"{BASE}/simulation", params={"p": "SPY:1", "paths": 1})
    assert resp.status_code == 422
    assert resp.json() == {"error": "Invalid value for paths."}


def test_unexpected_errors_hide_internals(monkeypatch: pytest.MonkeyPatch) -> None:
    import deanos_engine.api as api_mod

    def boom() -> None:
        raise RuntimeError("secret internal detail /some/path")

    monkeypatch.setattr(api_mod, "get_snapshot", boom)
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get(f"{BASE}/overview", params={"p": "SPY:1"})
    assert resp.status_code == 500
    assert "secret" not in resp.text and "/some/path" not in resp.text
    assert resp.headers["cache-control"] == "no-store"


# ─── Options pricing ────────────────────────────────────────────────────────────

OPT = {"s": 100, "k": 105, "t": 0.5, "r": 0.04, "q": 0.01, "sigma": 0.25, "type": "put"}


@pytest.mark.parametrize(
    ("path", "params", "keys"),
    [
        ("options/price", OPT, {"black_scholes", "binomial", "curves", "intrinsic"}),
        ("options/montecarlo", OPT, {"estimate", "plain", "convergence", "variance_reduction"}),
        ("options/asian", OPT, {"estimate", "geometric_closed_form", "convergence"}),
        ("options/implied-vol", {**OPT, "price": 8.0}, {"sigma", "curve", "bounds"}),
        ("options/validation", {}, {"textbook", "monte_carlo", "binomial", "implied_vol"}),
    ],
)
def test_options_endpoints(path: str, params: dict[str, object], keys: set[str]) -> None:
    set_snapshot(None)  # options pricing needs no market data
    resp = client.get(f"{BASE}/{path}", params=params)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert keys <= set(body)
    assert "s-maxage" in resp.headers["cache-control"]
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert "not investment advice" in body["disclaimer"]


def test_options_price_is_consistent() -> None:
    body = client.get(f"{BASE}/options/price", params=OPT).json()
    bs = body["black_scholes"]
    assert abs(bs["parity_gap"]) < 1e-6
    assert bs["price"] == bs["put"]
    b = body["binomial"]
    assert b["american"] >= b["european"]
    assert abs(b["european"] - bs["price"]) < 0.02
    assert b["early_exercise_premium"] >= 0
    assert len(body["curves"]["spot"]) == len(body["curves"]["american"])


def test_options_montecarlo_agrees_with_black_scholes() -> None:
    body = client.get(f"{BASE}/options/montecarlo", params={**OPT, "paths": 50_000}).json()
    lo, hi = body["estimate"]["ci95"]
    assert (
        abs(body["estimate"]["price"] - body["black_scholes"]) < 4 * body["estimate"]["std_error"]
    )
    assert lo < body["estimate"]["price"] < hi
    assert body["estimate"]["paths"] == 50_000


def test_options_implied_vol_round_trip() -> None:
    price = client.get(f"{BASE}/options/price", params=OPT).json()["black_scholes"]["price"]
    iv = client.get(f"{BASE}/options/implied-vol", params={**OPT, "price": price}).json()
    assert abs(iv["sigma"] - 0.25) < 1e-5


@pytest.mark.parametrize(
    ("path", "params", "fragment"),
    [
        ("options/implied-vol", {**OPT, "price": 0.001, "type": "call", "s": 150}, "below"),
        ("options/implied-vol", {**OPT, "price": 500}, "above"),
        ("options/implied-vol", {**OPT, "price": 5, "t": 0}, "time"),
        ("options/asian", {**OPT, "paths": 100_000, "obs": 1260}, "at most"),
    ],
)
def test_options_bad_combinations_are_400(
    path: str, params: dict[str, object], fragment: str
) -> None:
    resp = client.get(f"{BASE}/{path}", params=params)
    assert resp.status_code == 400, resp.text
    assert fragment in resp.json()["error"]


@pytest.mark.usefixtures("installed_snapshot")
def test_options_historical_vol() -> None:
    resp = client.get(f"{BASE}/options/historical-vol", params={"ticker": "spy"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ticker"] == "SPY"
    assert 0.05 < body["realized_vol"]["3m"] < 1.0
    assert body["as_of"] == "2026-09-25"
    assert (
        client.get(f"{BASE}/options/historical-vol", params={"ticker": "ZZZZ"}).status_code == 400
    )
    # Listed in 2026: not enough history for one year, enough for three months.
    ccc = client.get(f"{BASE}/options/historical-vol", params={"ticker": "CCC"}).json()
    assert ccc["realized_vol"]["1y"] is None


def test_options_historical_vol_without_data(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    set_snapshot(None)
    monkeypatch.setenv("DEANOS_DATA_PATH", str(tmp_path / "missing.npz"))
    resp = client.get(f"{BASE}/options/historical-vol", params={"ticker": "SPY"})
    assert resp.status_code == 503
    # Pricing itself keeps working without market data.
    assert client.get(f"{BASE}/options/price", params=OPT).status_code == 200
