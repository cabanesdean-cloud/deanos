"""Edge-case portfolios and hostile inputs through every endpoint.

The rule under test: the API answers 200 with finite (or null) numbers, or a
400/422 with a readable message. It never returns a 500.
"""

import math
from typing import Any

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from deanos_engine.api import app
from deanos_engine.portfolio import PortfolioError, parse_portfolio

client = TestClient(app, raise_server_exceptions=False)
BASE = "/deanos/api"
SECTIONS = ["overview", "risk", "volatility", "simulation", "regimes", "factors", "stress"]

EDGE_PORTFOLIOS = {
    "single_stock": "AAA:1",
    "single_bond": "AGG:1",
    "max_holdings": ",".join(
        ["SPY:1", "QQQ:1", "AGG:1", "IEF:1", "AAA:1"] + [f"S{k:02d}:1" for k in range(1, 21)]
    ),
    "late_listing": "SPY:50,BBB:50",
    "tiny_weight": "SPY:1000000,AGG:0.000001",
    "huge_weights": "SPY:1e12,AGG:3e12",
    "lowercase_spaces": "  spy : 60 , agg:40 ",
    "identical_twins": "SPY:50,S01:25,S02:25",
}


def _finite_or_none(obj: Any, path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            _finite_or_none(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _finite_or_none(v, f"{path}[{i}]")
    elif isinstance(obj, float):
        assert math.isfinite(obj), f"non-finite number at {path}"


@pytest.mark.usefixtures("installed_snapshot")
@pytest.mark.parametrize("name", list(EDGE_PORTFOLIOS))
@pytest.mark.parametrize("section", SECTIONS)
def test_edge_portfolios(name: str, section: str) -> None:
    resp = client.get(f"{BASE}/{section}", params={"p": EDGE_PORTFOLIOS[name]})
    assert resp.status_code in (200, 400), resp.text
    body = resp.json()
    if resp.status_code == 400:
        assert body["error"]
    else:
        _finite_or_none(body)


@pytest.mark.usefixtures("installed_snapshot")
def test_compare_identical_portfolios() -> None:
    resp = client.get(f"{BASE}/compare", params={"a": "SPY:1", "b": "spy:5"})
    assert resp.status_code == 200
    assert all(abs(v) < 1e-9 for v in resp.json()["difference"].values())


@pytest.mark.usefixtures("installed_snapshot")
@pytest.mark.parametrize(
    "params",
    [
        {"p": "SPY:1", "years": 0},
        {"p": "SPY:1", "years": 99},
        {"p": "SPY:1", "years": "ten"},
        {"p": "SPY:1", "horizon": 5},
        {"p": "SPY:1", "paths": 50},
        {"p": "SPY:1", "mean": "optimistic"},
        {"p": "SPY:1", "block": 0},
        {"p": "A" * 500},
    ],
)
def test_out_of_range_parameters_are_422(params: dict[str, object]) -> None:
    path = "simulation" if set(params) - {"p", "years"} else "overview"
    resp = client.get(f"{BASE}/{path}", params=params)
    assert resp.status_code == 422


@pytest.mark.usefixtures("installed_snapshot")
@pytest.mark.parametrize(
    "spec",
    [
        "SPY:1;DROP TABLE",
        "<script>alert(1)</script>:1",
        "SPY:1,,,,AGG:1",
        "SPY:inf",
        "SPY:-0",
        "SPY:1e400",
        "../../etc/passwd:1",
        "SPY:1,BRK.B:1",
        "\u0000:1",
        "СПЫ:1",
    ],
)
def test_hostile_specs_never_500(spec: str) -> None:
    resp = client.get(f"{BASE}/overview", params={"p": spec})
    assert resp.status_code in (200, 400, 422), resp.text
    if resp.status_code == 400:
        assert "<script>" not in resp.text


@given(st.text(max_size=120))
@settings(max_examples=400, deadline=None)
def test_parser_only_raises_portfolio_error(spec: str) -> None:
    try:
        holdings = parse_portfolio(spec)
    except PortfolioError:
        return
    assert 1 <= len(holdings) <= 25
    assert abs(sum(h.weight for h in holdings) - 1) < 1e-9
    assert all(h.weight > 0 for h in holdings)


tickers = st.sampled_from(["SPY", "AGG", "QQQ", "AAA", "S01", "ZZZ", "spy", "brk.b"])
weights = st.one_of(
    st.floats(allow_nan=True, allow_infinity=True, width=64).map(repr),
    st.integers(-5, 1000).map(str),
    st.text(max_size=5),
)


@pytest.mark.usefixtures("installed_snapshot")
@given(st.lists(st.tuples(tickers, weights), min_size=1, max_size=6))
@settings(
    max_examples=150, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_api_fuzz_never_500(pairs: list[tuple[str, str]]) -> None:
    spec = ",".join(f"{t}:{w}" for t, w in pairs)
    resp = client.get(f"{BASE}/overview", params={"p": spec})
    assert resp.status_code in (200, 400, 422), (spec, resp.text)


# ─── Options pricing: hostile and edge inputs ───────────────────────────────────

OPT_BASE = {"s": 100, "k": 100, "t": 1, "r": 0.04, "q": 0.0, "sigma": 0.2, "type": "call"}
OPTION_PATHS = ["options/price", "options/montecarlo", "options/asian"]


@pytest.mark.parametrize("path", OPTION_PATHS)
@pytest.mark.parametrize(
    "edge",
    [
        {"t": 0},
        {"t": 1e-9},
        {"sigma": 0},
        {"sigma": 1e-9},
        {"sigma": 5, "t": 30},
        {"s": 1_000_000, "k": 0.01},
        {"s": 0.01, "k": 1_000_000, "type": "put"},
        {"r": -0.1, "q": 0.5, "type": "put"},
        {"r": 0.5, "sigma": 0.001},
    ],
)
def test_option_edges_are_finite(path: str, edge: dict[str, object]) -> None:
    resp = client.get(f"{BASE}/{path}", params={**OPT_BASE, **edge, "paths": 2000})
    assert resp.status_code == 200, resp.text
    _finite_or_none(resp.json())


OUT_OF_RANGE: list[dict[str, object]] = [
    {"s": 0},
    {"s": -5},
    {"s": 1e308},
    {"s": "nan"},
    {"k": "inf"},
    {"t": -1},
    {"t": 31},
    {"sigma": -0.1},
    {"sigma": 50},
    {"r": 2},
    {"type": "straddle"},
    {"s": "1e400"},
    {"s": "<script>"},
]


@pytest.mark.parametrize(
    ("path", "bad"),
    [
        (path, bad)
        for path in [*OPTION_PATHS, "options/implied-vol"]
        for bad in OUT_OF_RANGE
        # The implied-volatility endpoint takes a price instead of a volatility.
        if not (path == "options/implied-vol" and "sigma" in bad)
    ],
)
def test_option_out_of_range_is_422(path: str, bad: dict[str, object]) -> None:
    resp = client.get(f"{BASE}/{path}", params={**OPT_BASE, "price": 5, **bad})
    assert resp.status_code == 422, resp.text
    assert "<script>" not in resp.text


@pytest.mark.parametrize(
    ("path", "bad"),
    [
        ("options/price", {"steps": 0}),
        ("options/price", {"steps": 5001}),
        ("options/montecarlo", {"paths": 10}),
        ("options/montecarlo", {"paths": 10_000_000}),
        ("options/montecarlo", {"seed": -1}),
        ("options/asian", {"obs": 0}),
        ("options/implied-vol", {"price": -1}),
        ("options/historical-vol", {"ticker": "../etc"}),
        ("options/historical-vol", {"ticker": "A" * 40}),
    ],
)
def test_option_size_limits_are_422(path: str, bad: dict[str, object]) -> None:
    resp = client.get(f"{BASE}/{path}", params={**OPT_BASE, "price": 5, **bad})
    assert resp.status_code == 422, resp.text


finite_or_junk = st.one_of(
    st.floats(allow_nan=True, allow_infinity=True, width=64).map(repr),
    st.integers(-10, 10**7).map(str),
    st.text(max_size=6),
)


@given(
    st.fixed_dictionaries(
        {
            "s": finite_or_junk,
            "k": finite_or_junk,
            "t": finite_or_junk,
            "sigma": finite_or_junk,
            "price": finite_or_junk,
        }
    ),
    st.sampled_from(["options/price", "options/implied-vol", "options/montecarlo"]),
)
@settings(max_examples=150, deadline=None)
def test_option_fuzz_never_500(params: dict[str, str], path: str) -> None:
    resp = client.get(f"{BASE}/{path}", params={**params, "paths": "1000", "steps": "50"})
    assert resp.status_code in (200, 400, 422), (params, resp.text)
    if resp.status_code == 200:
        _finite_or_none(resp.json())
