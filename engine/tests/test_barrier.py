"""Barrier options: closed form, discrete Monte Carlo, identities and the NVDA-style example."""

from __future__ import annotations

import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from deanos_engine.api import app
from deanos_engine.data import set_snapshot
from deanos_engine.models import options as o
from deanos_engine.models.options import BARRIER_TYPES, BarrierType, OptionKind, OptionsError

client = TestClient(app)
BASE = "/deanos/api"
ARGS = (100.0, 100.0, 1.0, 0.05, 0.02, 0.25)


def _cases() -> list[tuple[OptionKind, BarrierType, float]]:
    out: list[tuple[OptionKind, BarrierType, float]] = []
    for kind in ("call", "put"):
        for bt in BARRIER_TYPES:
            for h in (110.0, 125.0) if bt.startswith("up") else (75.0, 90.0):
                out.append((kind, bt, h))
    return out


@pytest.mark.parametrize(("kind", "bt", "h"), _cases())
def test_closed_form_matches_brownian_bridge_simulation(
    kind: OptionKind, bt: BarrierType, h: float
) -> None:
    """The continuous formula agrees with an independent, unbiased bridge simulation."""
    cf = o.barrier_price_continuous(*ARGS, kind, h, bt)
    mc = o.mc_barrier_continuous(*ARGS, kind, h, bt, n_steps=40, n_paths=200_000, seed=7)
    assert abs(mc["price"] - cf) < 4 * mc["std_error"] + 1e-4


@pytest.mark.parametrize(
    ("kind", "h", "up"),
    [("call", 120.0, True), ("put", 85.0, False), ("call", 90.0, False), ("put", 115.0, True)],
)
def test_in_plus_out_equals_european(kind: OptionKind, h: float, up: bool) -> None:
    ko: BarrierType = "up-and-out" if up else "down-and-out"
    ki: BarrierType = "up-and-in" if up else "down-and-in"
    vanilla = o.bs_price(*ARGS, kind)
    assert o.barrier_price_continuous(*ARGS, kind, h, ko) + o.barrier_price_continuous(
        *ARGS, kind, h, ki
    ) == pytest.approx(vanilla, abs=1e-10)
    # Same seed, same paths: the Monte Carlo identity holds path by path.
    a = o.mc_barrier(*ARGS, kind, h, ko, n_obs=52, n_paths=20_000, seed=3)["estimate"]["price"]
    b = o.mc_barrier(*ARGS, kind, h, ki, n_obs=52, n_paths=20_000, seed=3)["estimate"]["price"]
    euro = o.mc_barrier(*ARGS, kind, 1e6 if up else 1e-6, ko, n_obs=52, n_paths=20_000, seed=3)[
        "estimate"
    ]["price"]
    assert a + b == pytest.approx(euro, rel=1e-12)


@pytest.mark.parametrize(("r", "q"), [(0.03, 0.03), (0.05, 0.0), (0.01, 0.04)])
def test_down_and_in_call_is_a_reflected_call(r: float, q: float) -> None:
    """Reflection principle: for H <= K, c_di(S) = (H/S)^(2 lambda - 2) c(H^2 / S)."""
    s, k, t, sigma, h = 100.0, 100.0, 1.0, 0.3, 90.0
    lam = (r - q + 0.5 * sigma * sigma) / (sigma * sigma)
    di = o.barrier_price_continuous(s, k, t, r, q, sigma, "call", h, "down-and-in")
    image = (h / s) ** (2 * lam - 2) * o.bs_price(h * h / s, k, t, r, q, sigma, "call")
    assert di == pytest.approx(image, rel=1e-10)


def test_discrete_monitoring_sits_between_european_and_continuous() -> None:
    """Knock-out: continuous <= discrete <= European, converging as dates are added."""
    cont = o.barrier_price_continuous(*ARGS, "call", 120.0, "up-and-out")
    prices = [
        o.mc_barrier(*ARGS, "call", 120.0, "up-and-out", n_obs=n, n_paths=100_000, seed=1)[
            "estimate"
        ]
        for n in (4, 12, 52, 252)
    ]
    vals = [p["price"] for p in prices]
    assert all(v > cont for v in vals)
    assert vals == sorted(vals, reverse=True)
    assert vals[-1] - cont < vals[0] - cont


@pytest.mark.parametrize(
    ("kind", "bt", "h"),
    [
        ("call", "up-and-out", 120.0),
        ("put", "down-and-out", 80.0),
        ("call", "down-and-in", 90.0),
        ("put", "up-and-in", 110.0),
    ],
)
def test_bgk_correction_approximates_discrete_price(
    kind: OptionKind, bt: BarrierType, h: float
) -> None:
    res = o.mc_barrier(*ARGS, kind, h, bt, n_obs=52, n_paths=100_000, seed=11)
    est = res["estimate"]
    # BGK is an approximation; with the barrier this far from spot it is within ~2% of the price.
    assert abs(res["discrete_bgk"] - est["price"]) < 5 * est["std_error"] + 0.02 * est["price"]
    assert abs(res["continuous_closed_form"] - est["price"]) > abs(
        res["discrete_bgk"] - est["price"]
    )


def test_already_breached_barrier() -> None:
    # Spot 100 is already below a down barrier at 105 and above an up barrier at 95.
    assert o.barrier_price_continuous(*ARGS, "call", 105.0, "down-and-out") == 0.0
    assert o.barrier_price_continuous(*ARGS, "call", 95.0, "up-and-in") == pytest.approx(
        o.bs_price(*ARGS, "call")
    )
    assert o.barrier_price_bgk(*ARGS, "call", 105.0, "down-and-in", 52) == pytest.approx(
        o.bs_price(*ARGS, "call")
    )
    res = o.mc_barrier(*ARGS, "put", 100.0, "up-and-out", n_obs=12, n_paths=2_000)
    assert res["breached_at_start"] and res["estimate"]["price"] == 0.0
    res = o.mc_barrier(*ARGS, "put", 100.0, "up-and-in", n_obs=12, n_paths=2_000)
    assert res["hit_share"] == 1.0


def test_trivial_barriers() -> None:
    # An up-and-out call with the barrier at or below the strike can never pay.
    assert o.barrier_price_continuous(*ARGS, "call", 100.5, "up-and-in") <= o.bs_price(
        *ARGS, "call"
    )
    assert o.barrier_price_continuous(
        100.0, 110.0, 1.0, 0.05, 0.02, 0.25, "call", 105.0, "up-and-out"
    ) == pytest.approx(0.0, abs=1e-12)
    assert o.barrier_price_continuous(
        100.0, 90.0, 1.0, 0.05, 0.02, 0.25, "put", 95.0, "down-and-out"
    ) == pytest.approx(0.0, abs=1e-12)
    far = o.barrier_price_continuous(*ARGS, "call", 1e5, "up-and-out")
    assert far == pytest.approx(o.bs_price(*ARGS, "call"), rel=1e-9)


def test_degenerate_volatility_and_time() -> None:
    s, k, r, q = 100.0, 100.0, 0.05, 0.0
    # Deterministic path grows to 100 e^{0.05} = 105.1: an up barrier at 104 is crossed.
    assert o.barrier_price_continuous(s, k, 1.0, r, q, 0.0, "call", 104.0, "up-and-out") == 0.0
    assert o.barrier_price_continuous(
        s, k, 1.0, r, q, 0.0, "call", 106.0, "up-and-out"
    ) == pytest.approx(o.bs_price(s, k, 1.0, r, q, 0.0, "call"))
    assert o.barrier_price_continuous(s, k, 0.0, r, q, 0.2, "put", 90.0, "down-and-in") == 0.0


def test_monte_carlo_reports_honest_uncertainty() -> None:
    res = o.mc_barrier(*ARGS, "call", 90.0, "down-and-out", n_obs=52, n_paths=40_000, seed=5)
    est = res["estimate"]
    assert est["ci95"][0] < est["price"] < est["ci95"][1]
    assert est["paths"] == 40_000
    assert res["variance_reduction"] is not None and res["variance_reduction"] > 1.0
    assert 0.0 < res["hit_share"] < 1.0
    assert len(res["convergence"]["paths"]) == len(res["convergence"]["controlled"])


def test_coverage_of_discrete_intervals() -> None:
    """Over independent seeds, the 95% interval covers a precise reference about 95% of the time."""
    ref = o.mc_barrier(*ARGS, "call", 120.0, "up-and-out", n_obs=12, n_paths=2_000_000, seed=999)[
        "estimate"
    ]["price"]
    hits = 0
    for i in range(200):
        lo, hi = o.mc_barrier(*ARGS, "call", 120.0, "up-and-out", n_obs=12, n_paths=10_000, seed=i)[
            "estimate"
        ]["ci95"]
        hits += int(lo <= ref <= hi)
    assert 0.89 <= hits / 200 <= 0.99


@pytest.mark.parametrize(
    ("h", "bt", "fragment"),
    [
        (0.0, "up-and-out", "positive"),
        (-5.0, "down-and-in", "positive"),
        (math.nan, "up-and-in", "positive"),
        (110.0, "sideways", "barrier type"),
    ],
)
def test_bad_inputs(h: float, bt: str, fragment: str) -> None:
    with pytest.raises(OptionsError, match=fragment):
        o.barrier_price_continuous(*ARGS, "call", h, bt)  # type: ignore[arg-type]


def test_validation_report_has_barrier_table() -> None:
    table = o.barrier_validation(paths=100_000)
    assert len(table["rows"]) == len(o.BARRIER_CASES)
    for row in table["rows"]:
        assert (
            row["bridge_within_ci"]
            or abs(row["bridge"] - row["closed_form"]) < 4 * row["bridge_std_error"]
        )
        assert set(row["discrete"]) == {"12", "52", "252"}


def test_mc_vs_black_scholes_example() -> None:
    ex = o.mc_vs_black_scholes(
        228.86, 229.0, 0.25, 0.04, 0.0, 0.376, "call", n_paths=100_000, seed=42
    )
    assert ex["paths"] == 100_000
    assert [r["estimator"] for r in ex["rows"]] == ["plain", "antithetic", "antithetic_control"]
    for r in ex["rows"]:
        assert r["difference"] == pytest.approx(r["price"] - ex["black_scholes"])
        assert abs(r["z"]) < 4
    best = ex["rows"][-1]
    assert best["std_error"] < ex["rows"][0]["std_error"] / 3


# ─── API ──────────────────────────────────────────────────────────────────────

OPT = {"s": 100, "k": 100, "t": 1, "r": 0.05, "q": 0.02, "sigma": 0.25, "type": "call"}


def test_barrier_endpoint() -> None:
    set_snapshot(None)
    resp = client.get(f"{BASE}/options/barrier", params={**OPT, "h": 120, "btype": "up-and-out"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert {
        "estimate",
        "continuous_closed_form",
        "discrete_bgk",
        "european_black_scholes",
        "monitoring_dates",
    } <= set(body)
    assert (
        body["continuous_closed_form"] < body["estimate"]["price"] < body["european_black_scholes"]
    )
    assert body["inputs"]["btype"] == "up-and-out"


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"h": 0}, 422),
        ({"h": 120, "btype": "sideways"}, 422),
        ({"h": 120, "obs": 0}, 422),
        ({"h": 120, "obs": 1260, "paths": 100_000}, 400),
        ({}, 422),
    ],
)
def test_barrier_endpoint_rejects_bad_inputs(params: dict[str, object], status: int) -> None:
    resp = client.get(f"{BASE}/options/barrier", params={**OPT, **params})
    assert resp.status_code == status, resp.text


def test_validation_endpoint_carries_barrier_and_example(installed_snapshot: object) -> None:
    # The synthetic snapshot has no NVDA: the example is omitted, validation still loads.
    body = client.get(f"{BASE}/options/validation").json()
    assert "barrier" in body
    assert body["ticker_example"] is None


def test_example_uses_snapshot_when_ticker_present(
    monkeypatch: pytest.MonkeyPatch, installed_snapshot: object
) -> None:
    monkeypatch.setattr(o, "EXAMPLE_TICKER", "SPY")
    ex = client.get(f"{BASE}/options/validation").json()["ticker_example"]
    assert ex["ticker"] == "SPY" and ex["paths"] == 100_000
    assert ex["inputs"]["k"] == round(ex["inputs"]["s"])
    assert np.isfinite(ex["rows"][-1]["difference_pct"])
