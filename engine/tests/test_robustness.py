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


# ─── Transaction ML: hostile and edge inputs ────────────────────────────────────

TX_PATH = f"{BASE}/transactions/categorize"


@pytest.mark.parametrize(
    "d",
    [
        "a",
        "0",
        "A" * 200,
        "Café Olé",
        "ＳＴＡＲＢＵＣＫＳ",  # fullwidth letters fold to ASCII
        "<script>alert(1)</script>",
        "'; DROP TABLE t;--",
        "%00%0d%0a",
        "\u202eRLO override text",
        "x" * 199 + "é",
    ],
)
def test_transactions_edge_descriptions_are_200(d: str) -> None:
    resp = client.get(TX_PATH, params={"d": d})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    _finite_or_none(body)
    assert abs(sum(body["probabilities"].values()) - 1) < 1e-4
    assert "<script>" not in resp.text


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"d": ""}, 422),
        ({"d": "A" * 201}, 422),
        ({}, 422),
        ({"d": "COFFEE", "a": "nan"}, 422),
        ({"d": "COFFEE", "a": "inf"}, 422),
        ({"d": "COFFEE", "a": "1e400"}, 422),
        ({"d": "COFFEE", "a": 1_000_001}, 422),
        ({"d": "COFFEE", "a": "<script>"}, 422),
        ({"d": "COFFEE", "k": 0}, 422),
        ({"d": "COFFEE", "k": 15}, 422),
        ({"d": "🙂"}, 400),
        ({"d": "     "}, 400),
        ({"d": "店铺"}, 400),
    ],
)
def test_transactions_bad_inputs(params: dict[str, object], status: int) -> None:
    resp = client.get(TX_PATH, params=params)
    assert resp.status_code == status, resp.text
    assert "error" in resp.json()
    assert "<script>" not in resp.text


def test_transactions_batch_limits() -> None:
    ok = client.get(f"{BASE}/transactions/batch", params=[("d", f"SHOP {i}") for i in range(25)])
    assert ok.status_code == 200 and len(ok.json()["rows"]) == 25
    over = client.get(f"{BASE}/transactions/batch", params=[("d", "SHOP")] * 26)
    assert over.status_code == 422
    assert client.get(f"{BASE}/transactions/batch").status_code == 422
    long_row = client.get(f"{BASE}/transactions/batch", params=[("d", "A" * 500)])
    assert long_row.status_code == 200 and "limited" in long_row.json()["rows"][0]["error"]


@given(
    st.text(max_size=250),
    st.one_of(
        st.none(),
        st.floats(allow_nan=True, allow_infinity=True).map(repr),
        st.text(max_size=8),
    ),
    st.one_of(st.none(), st.integers(-5, 20).map(str), st.text(max_size=3)),
)
@settings(max_examples=200, deadline=None)
def test_transactions_fuzz_never_500(d: str, a: str | None, k: str | None) -> None:
    params = {"d": d, **({"a": a} if a is not None else {}), **({"k": k} if k is not None else {})}
    resp = client.get(TX_PATH, params=params)
    assert resp.status_code in (200, 400, 422), (params, resp.text)
    if resp.status_code == 200:
        _finite_or_none(resp.json())


@given(st.lists(st.text(max_size=60), min_size=1, max_size=30), st.lists(st.text(max_size=6)))
@settings(max_examples=80, deadline=None)
def test_transactions_batch_fuzz_never_500(ds: list[str], amounts: list[str]) -> None:
    params = [("d", d) for d in ds] + [("a", a) for a in amounts]
    resp = client.get(f"{BASE}/transactions/batch", params=params)
    assert resp.status_code in (200, 400, 422), resp.text
