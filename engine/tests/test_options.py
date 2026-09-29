"""Option pricing models: known values, identities, convergence and edge cases."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pytest

from deanos_engine.models import options as o
from deanos_engine.models.options import KINDS, OptionKind, OptionsError

Args = tuple[float, float, float, float, float, float]

GRID: list[Args] = [
    # s, k, t, r, q, sigma
    (100.0, 100.0, 1.0, 0.05, 0.0, 0.2),
    (100.0, 80.0, 0.25, 0.03, 0.02, 0.35),
    (100.0, 130.0, 2.0, 0.01, 0.04, 0.15),
    (42.0, 40.0, 0.5, 0.10, 0.0, 0.2),
    (930.0, 900.0, 2 / 12, 0.08, 0.03, 0.2),
    (10.0, 12.0, 5.0, -0.005, 0.0, 0.6),
]


# ─── Black-Scholes-Merton ─────────────────────────────────────────────────────


@pytest.mark.parametrize("case", o.TEXTBOOK_CASES, ids=lambda c: c["id"])
def test_textbook_values(case: dict[str, Any]) -> None:
    got = o.textbook_value(case)
    d = int(case["decimals"])
    assert round(got, d) == pytest.approx(case["expected"], abs=10**-d / 2)


def test_textbook_values_more_precisely() -> None:
    # Hull quotes these to two decimals; the exact values are well known.
    assert o.bs_price(42, 40, 0.5, 0.1, 0.0, 0.2, "call") == pytest.approx(4.7594, abs=1e-4)
    assert o.bs_price(42, 40, 0.5, 0.1, 0.0, 0.2, "put") == pytest.approx(0.8086, abs=1e-4)


@pytest.mark.parametrize("args", GRID)
def test_put_call_parity(args: Args) -> None:
    s, k, t, r, q, sigma = args
    c = o.bs_price(s, k, t, r, q, sigma, "call")
    p = o.bs_price(s, k, t, r, q, sigma, "put")
    assert abs(o.parity_gap(s, k, t, r, q, c, p)) < 1e-10 * max(1.0, s)


@pytest.mark.parametrize("args", GRID)
@pytest.mark.parametrize("kind", KINDS)
def test_price_bounds(args: Args, kind: OptionKind) -> None:
    s, k, t, r, q, sigma = args
    lo, hi = o.price_bounds(s, k, t, r, q, kind)
    assert lo - 1e-12 <= o.bs_price(s, k, t, r, q, sigma, kind) <= hi


@pytest.mark.parametrize("args", GRID)
@pytest.mark.parametrize("kind", KINDS)
def test_greeks_match_finite_differences(args: Args, kind: OptionKind) -> None:
    s, k, t, r, q, sigma = args
    g = o.bs_greeks(s, k, t, r, q, sigma, kind)

    def v(**kw: float) -> float:
        p = {"s": s, "k": k, "t": t, "r": r, "q": q, "sigma": sigma, **kw}
        return o.bs_price(p["s"], p["k"], p["t"], p["r"], p["q"], p["sigma"], kind)

    hs, hv, hr, ht = s * 1e-4, 1e-5, 1e-5, 1e-5
    delta = (v(s=s + hs) - v(s=s - hs)) / (2 * hs)
    gamma = (v(s=s + hs) - 2 * v() + v(s=s - hs)) / hs**2
    vega = (v(sigma=sigma + hv) - v(sigma=sigma - hv)) / (2 * hv)
    rho = (v(r=r + hr) - v(r=r - hr)) / (2 * hr)
    theta = -(v(t=t + ht) - v(t=t - ht)) / (2 * ht)  # value lost as expiry approaches
    scale = max(1.0, s)
    assert g["delta"] == pytest.approx(delta, abs=1e-6)
    assert g["gamma"] == pytest.approx(gamma, rel=1e-3, abs=1e-6)
    assert g["vega"] == pytest.approx(vega, abs=1e-5 * scale)
    assert g["rho"] == pytest.approx(rho, abs=1e-5 * scale)
    assert g["theta"] == pytest.approx(theta, abs=1e-5 * scale)


def test_prob_itm_is_n_d2() -> None:
    p_call = o.prob_in_the_money(100, 100, 1, 0.05, 0, 0.2, "call")
    p_put = o.prob_in_the_money(100, 100, 1, 0.05, 0, 0.2, "put")
    assert p_call + p_put == pytest.approx(1.0)
    assert p_call == pytest.approx(0.5596, abs=1e-4)  # N(0.15)


# ─── Edge inputs: limits instead of division by zero ─────────────────────────


@pytest.mark.parametrize("kind", KINDS)
def test_expiry_now_is_intrinsic(kind: OptionKind) -> None:
    for s in (80.0, 100.0, 120.0):
        assert o.bs_price(s, 100, 0.0, 0.05, 0.02, 0.3, kind) == o.intrinsic(s, 100, kind)
        assert o.binomial_price(s, 100, 0.0, 0.05, 0.02, 0.3, kind, 50) == pytest.approx(
            o.intrinsic(s, 100, kind)
        )
        # A moment before expiry the price is continuous with intrinsic value.
        assert o.bs_price(s, 100, 1e-10, 0.05, 0.02, 0.3, kind) == pytest.approx(
            o.intrinsic(s, 100, kind), abs=1e-3
        )
    g = o.bs_greeks(120, 100, 0.0, 0.05, 0.0, 0.3, "call")
    assert g["delta"] == 1.0 and g["gamma"] == 0.0


def test_zero_volatility_is_discounted_forward_intrinsic() -> None:
    s, k, t, r, q = 100.0, 100.0, 1.0, 0.05, 0.01
    fwd_value = s * math.exp(-q * t) - k * math.exp(-r * t)
    assert o.bs_price(s, k, t, r, q, 0.0, "call") == pytest.approx(fwd_value)
    assert o.bs_price(s, k, t, r, q, 0.0, "put") == 0.0
    # Continuous in sigma.
    assert o.bs_price(s, k, t, r, q, 1e-6, "call") == pytest.approx(fwd_value, abs=1e-6)
    mc = o.mc_european(s, k, t, r, q, 0.0, "call", n_paths=2000)
    assert mc["estimate"]["price"] == pytest.approx(fwd_value)
    assert mc["estimate"]["std_error"] == pytest.approx(0.0, abs=1e-12)
    assert mc["within_ci"]


def test_zero_volatility_american_put_exercises_on_best_date() -> None:
    # Deep in the money put with high rates: exercising now beats waiting.
    v = o.binomial_price(50, 100, 1.0, 0.10, 0.0, 0.0, "put", 100, american=True)
    assert v == pytest.approx(50.0)
    eu = o.binomial_price(50, 100, 1.0, 0.10, 0.0, 0.0, "put", 100, american=False)
    assert eu == pytest.approx(100 * math.exp(-0.1) - 50)


@pytest.mark.parametrize(
    "args",
    [
        (1e6, 0.01, 30.0, 0.5, 0.0, 5.0),
        (0.01, 1e6, 30.0, -0.1, 0.5, 5.0),
        (100.0, 100.0, 30.0, 0.0, 0.0, 5.0),
        (100.0, 100.0, 1e-9, 0.05, 0.0, 1e-9),
        (100.0, 100.0, 1.0, 0.5, -0.1, 0.001),
    ],
)
@pytest.mark.parametrize("kind", KINDS)
def test_extreme_inputs_stay_finite(args: Args, kind: OptionKind) -> None:
    s, k, t, r, q, sigma = args
    vals = [
        o.bs_price(*args, kind),
        *o.bs_greeks(*args, kind).values(),
        o.binomial_price(*args, kind, 2000, american=True),
        o.binomial_price(*args, kind, 2000, american=False),
        o.mc_european(*args, kind, n_paths=2000)["estimate"]["price"],
        o.mc_asian(*args, kind, n_obs=12, n_paths=2000)["estimate"]["price"],
    ]
    assert all(math.isfinite(v) for v in vals), vals
    lo, hi = o.price_bounds(s, k, t, r, q, kind)
    assert lo - 1e-9 * hi <= vals[0] <= hi * (1 + 1e-12)


@pytest.mark.parametrize(
    ("args", "fragment"),
    [
        ((-1.0, 100.0, 1.0, 0.0, 0.0, 0.2), "positive"),
        ((100.0, 0.0, 1.0, 0.0, 0.0, 0.2), "positive"),
        ((100.0, 100.0, -1.0, 0.0, 0.0, 0.2), "negative"),
        ((100.0, 100.0, 1.0, 0.0, 0.0, -0.2), "negative"),
        ((math.nan, 100.0, 1.0, 0.0, 0.0, 0.2), "finite"),
        ((100.0, 100.0, math.inf, 0.0, 0.0, 0.2), "finite"),
    ],
)
def test_invalid_inputs_raise_options_error(args: Args, fragment: str) -> None:
    with pytest.raises(OptionsError, match=fragment):
        o.bs_price(*args, "call")


def test_bad_kind() -> None:
    with pytest.raises(OptionsError):
        o.bs_price(100, 100, 1, 0, 0, 0.2, "straddle")  # type: ignore[arg-type]


# ─── Monte Carlo ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize("args", GRID)
@pytest.mark.parametrize("kind", KINDS)
def test_mc_within_ci_of_black_scholes(args: Args, kind: OptionKind) -> None:
    res = o.mc_european(*args, kind, n_paths=50_000, seed=7)
    exact = o.bs_price(*args, kind)
    se = res["estimate"]["std_error"]
    # 4 standard errors: a fixed-seed test that fails only on a real bias.
    assert abs(res["estimate"]["price"] - exact) <= 4 * se + 1e-12
    assert abs(res["plain"]["price"] - exact) <= 4 * res["plain"]["std_error"] + 1e-12
    assert res["black_scholes"] == exact


def test_mc_variance_reduction_and_convergence() -> None:
    res = o.mc_european(100, 100, 1, 0.05, 0.02, 0.25, "call", n_paths=40_000)
    vr = res["variance_reduction"]
    assert vr["antithetic"] > 1.2
    assert vr["antithetic_control"] > 10
    conv = res["convergence"]
    paths = np.array(conv["paths"])
    assert paths[0] == 100 and paths[-1] == 40_000 and np.all(np.diff(paths) > 0)
    se = np.array(conv["controlled_se"])
    # Standard error falls like 1/sqrt(n).
    ratio = se[0] / se[-1]
    assert ratio == pytest.approx(math.sqrt(paths[-1] / paths[0]), rel=0.35)
    assert res["estimate"]["ci95"][0] < res["estimate"]["price"] < res["estimate"]["ci95"][1]


def test_mc_is_reproducible_and_odd_paths_round_to_pairs() -> None:
    a = o.mc_european(100, 100, 1, 0.05, 0, 0.2, "put", n_paths=10_001, seed=3)
    b = o.mc_european(100, 100, 1, 0.05, 0, 0.2, "put", n_paths=10_001, seed=3)
    assert a["estimate"] == b["estimate"]
    assert a["estimate"]["paths"] == 10_000


def test_mc_interval_coverage_is_close_to_95_percent() -> None:
    report = o.validation_report()
    assert 0.93 <= report["monte_carlo"]["coverage"] <= 0.97
    assert all(row["matches"] for row in report["textbook"])
    assert report["implied_vol"]["max_abs_error"] < 1e-6
    errors = [abs(row["error"]) for row in report["binomial"]["rows"]]
    assert errors == sorted(errors, reverse=True)


# ─── Asian options ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("kind", KINDS)
def test_geometric_asian_with_one_date_is_european(kind: OptionKind) -> None:
    for args in GRID:
        assert o.geometric_asian_price(*args, kind, 1) == pytest.approx(
            o.bs_price(*args, kind), rel=1e-12, abs=1e-12
        )


def test_geometric_asian_matches_simulation() -> None:
    s, k, t, r, q, sigma, n = 100.0, 95.0, 1.0, 0.04, 0.01, 0.3, 12
    rng = np.random.default_rng(1)
    dt = t / n
    z = rng.standard_normal((200_000, n))
    logp = np.cumsum((r - q - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * z, axis=1)
    geo = s * np.exp(logp.mean(axis=1))
    payoff = math.exp(-r * t) * np.maximum(geo - k, 0)
    se = payoff.std() / math.sqrt(len(payoff))
    closed = o.geometric_asian_price(s, k, t, r, q, sigma, "call", n)
    assert abs(payoff.mean() - closed) < 4 * se


def test_arithmetic_asian_ordering_and_precision() -> None:
    args = (100.0, 100.0, 1.0, 0.05, 0.0, 0.25)
    res = o.mc_asian(*args, "call", n_obs=52, n_paths=40_000)
    price = res["estimate"]["price"]
    # AM-GM: arithmetic average >= geometric average, so the call is worth more.
    assert price >= res["geometric_closed_form"] - 3 * res["estimate"]["std_error"]
    # Averaging lowers volatility: cheaper than the European call.
    assert price < res["european_black_scholes"]
    assert res["variance_reduction"] > 50  # the geometric control is very strong
    # Independent check: plain Monte Carlo with many more paths and a different seed.
    rng = np.random.default_rng(99)
    s, k, t, r, q, sigma = args
    dt = t / 52
    z = rng.standard_normal((300_000, 52))
    logp = np.cumsum((r - q - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * z, axis=1)
    payoff = math.exp(-r * t) * np.maximum(s * np.exp(logp).mean(axis=1) - k, 0)
    se_plain = payoff.std() / math.sqrt(len(payoff))
    assert abs(payoff.mean() - price) < 4 * math.hypot(se_plain, res["estimate"]["std_error"])


# ─── Binomial trees ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("args", GRID)
@pytest.mark.parametrize("kind", KINDS)
def test_binomial_european_converges_to_black_scholes(args: Args, kind: OptionKind) -> None:
    exact = o.bs_price(*args, kind)
    tree = o.binomial_price(*args, kind, 2000, american=False)
    assert tree == pytest.approx(exact, abs=0.005 * max(1.0, args[0] / 100))


@pytest.mark.parametrize("args", GRID)
def test_american_put_at_least_european(args: Args) -> None:
    am = o.binomial_price(*args, "put", 500, american=True)
    eu_tree = o.binomial_price(*args, "put", 500, american=False)
    assert am >= eu_tree - 1e-12
    assert am >= o.intrinsic(args[0], args[1], "put") - 1e-12
    assert am >= o.bs_price(*args, "put") - 0.01 * max(1.0, args[0] / 100)


@pytest.mark.parametrize("args", [a for a in GRID if a[4] == 0 and a[3] >= 0])
def test_american_call_without_dividends_equals_european(args: Args) -> None:
    am = o.binomial_price(*args, "call", 800, american=True)
    eu = o.binomial_price(*args, "call", 800, american=False)
    assert am == pytest.approx(eu, abs=1e-10)
    assert am == pytest.approx(o.bs_price(*args, "call"), abs=0.01)


def test_american_call_with_high_dividend_has_premium() -> None:
    args = (100.0, 80.0, 1.0, 0.02, 0.10, 0.2)
    am = o.binomial_price(*args, "call", 500, american=True)
    eu = o.binomial_price(*args, "call", 500, american=False)
    assert am > eu + 0.1


def test_binomial_known_american_put_value() -> None:
    # Hull's 5-step tree, and the value the tree converges to with many steps.
    five = o.binomial_price(50, 50, 5 / 12, 0.1, 0.0, 0.4, "put", 5)
    assert five == pytest.approx(4.4885, abs=1e-3)
    converged = o.binomial_price(50, 50, 5 / 12, 0.1, 0.0, 0.4, "put", 2000)
    assert converged == pytest.approx(4.28, abs=0.01)


def test_binomial_drift_fallback_keeps_probabilities_valid() -> None:
    # sigma sqrt(dt) < |r - q| dt: plain CRR probabilities leave (0, 1).
    args = (100.0, 100.0, 1.0, 0.5, 0.0, 0.01)
    tree = o.binomial_price(*args, "call", 10, american=False)
    assert tree == pytest.approx(o.bs_price(*args, "call"), rel=1e-3)


def test_binomial_convergence_grid() -> None:
    conv = o.binomial_convergence(100, 100, 1, 0.05, 0.0, 0.2, "put", max_steps=333)
    assert conv["steps"][-1] == 333 and conv["steps"][0] == 5
    assert all(a >= e - 1e-12 for a, e in zip(conv["american"], conv["european"], strict=True))


# ─── Implied volatility ───────────────────────────────────────────────────────


def _iv_cases() -> list[tuple[OptionKind, float, float, float]]:
    """Grid of round-trip cases, minus prices indistinguishable from a no-arbitrage bound
    (deep in or out of the money, short dated), which carry no information about sigma."""
    out = []
    for kind in KINDS:
        for k in (50.0, 90.0, 100.0, 110.0, 200.0):
            for t in (0.01, 0.5, 3.0):
                for sigma in (0.03, 0.2, 0.8, 3.0):
                    price = o.bs_price(100.0, k, t, 0.03, 0.01, sigma, kind)
                    lo, hi = o.price_bounds(100.0, k, t, 0.03, 0.01, kind)
                    if price - lo > 1e-7 * hi and hi - price > 1e-7 * hi:
                        out.append((kind, k, t, sigma))
    return out


IV_CASES = _iv_cases()


def test_iv_grid_is_substantial() -> None:
    assert len(IV_CASES) >= 80


@pytest.mark.parametrize(("kind", "k", "t", "sigma"), IV_CASES)
def test_implied_vol_round_trip(kind: OptionKind, k: float, t: float, sigma: float) -> None:
    s, r, q = 100.0, 0.03, 0.01
    price = o.bs_price(s, k, t, r, q, sigma, kind)
    res = o.implied_vol(price, s, k, t, r, q, kind)
    assert res["converged"]
    assert res["sigma"] == pytest.approx(sigma, rel=1e-5, abs=1e-6)
    assert res["iterations"] <= 100


def test_implied_vol_uses_bisection_when_newton_would_jump() -> None:
    # Deep out of the money, short dated: vega is tiny at a poor starting guess.
    price = o.bs_price(100, 160, 0.1, 0.02, 0.0, 0.9, "call")
    res = o.implied_vol(price, 100, 160, 0.1, 0.02, 0.0, "call")
    assert res["sigma"] == pytest.approx(0.9, rel=1e-6)


@pytest.mark.parametrize(
    ("price", "fragment"),
    [
        (0.5, "below"),  # below intrinsic for an in-the-money call
        (200.0, "above"),  # above the spot price
        (math.nan, "finite"),
    ],
)
def test_implied_vol_rejects_impossible_prices(price: float, fragment: str) -> None:
    with pytest.raises(OptionsError, match=fragment):
        o.implied_vol(price, 110, 100, 0.5, 0.02, 0.0, "call")


def test_implied_vol_needs_time() -> None:
    with pytest.raises(OptionsError, match="time"):
        o.implied_vol(5.0, 100, 100, 0.0, 0.02, 0.0, "call")


def test_implied_vol_at_lower_bound_is_zero() -> None:
    lo, _ = o.price_bounds(120, 100, 1, 0.05, 0, "call")
    assert o.implied_vol(lo, 120, 100, 1, 0.05, 0, "call")["sigma"] == 0.0


# ─── Historical volatility and curves ─────────────────────────────────────────


def test_realized_vol_recovers_simulated_sigma() -> None:
    rng = np.random.default_rng(0)
    rets = rng.normal(0, 0.3 / math.sqrt(252), 5000)
    prices = 100 * np.exp(np.cumsum(rets))
    assert o.realized_vol(prices, 2520) == pytest.approx(0.3, rel=0.05)
    with pytest.raises(OptionsError):
        o.realized_vol(prices[:10], 63)


def test_value_curves_shape() -> None:
    c = o.value_curves(100, 100, 0.5, 0.05, 0.0, 0.3, "put")
    n = len(c["spot"])
    assert all(len(c[key]) == n for key in ("payoff", "european", "american", "delta", "gamma"))
    assert all(a >= e - 1e-2 for a, e in zip(c["american"], c["european"], strict=True))
    assert all(a >= p - 1e-9 for a, p in zip(c["american"], c["payoff"], strict=True))
