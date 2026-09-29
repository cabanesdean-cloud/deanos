"""Nonlinear Beta Tracker: calculations checked against known relationships and statsmodels."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
import statsmodels.api as sm
from fastapi.testclient import TestClient

from deanos_engine.api import app
from deanos_engine.models import beta

client = TestClient(app)
BASE = "/deanos/api"


def _market(n: int, seed: int = 0, sd: float = 0.01) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.standard_t(5, n) * sd / np.sqrt(5 / 3)


def _dates(n: int) -> pd.DatetimeIndex:
    return pd.bdate_range("2015-01-02", periods=n)


# ─── Regression core ──────────────────────────────────────────────────────────


def test_ols_matches_statsmodels_classical_and_hc1() -> None:
    rng = np.random.default_rng(1)
    x = _market(800, 1)
    y = 0.0002 + 1.3 * x + 4.0 * x**2 + rng.normal(0, 0.004, 800) * (1 + 40 * np.abs(x))
    X = np.column_stack([np.ones_like(x), x, x * x])
    ours = beta.ols(y, X)
    ref = sm.OLS(y, X).fit()
    ref_hc1 = sm.OLS(y, X).fit(cov_type="HC1")
    np.testing.assert_allclose(ours["coef"], ref.params, rtol=1e-10)
    np.testing.assert_allclose(ours["se"], ref.bse, rtol=1e-8)
    np.testing.assert_allclose(ours["se_robust"], ref_hc1.bse, rtol=1e-8)
    np.testing.assert_allclose(ours["p_classical"], ref.pvalues, rtol=1e-6, atol=1e-300)
    assert ours["r_squared"] == pytest.approx(ref.rsquared, rel=1e-10)


def test_ols_rank_deficient_is_reported_not_raised() -> None:
    x = np.ones(50)
    assert beta.ols(np.arange(50.0), np.column_stack([np.ones(50), x]))["ok"] is False


def test_linear_truth_gives_flat_sensitivity_and_no_evidence_of_curvature() -> None:
    n = 2500
    x = _market(n, 2)
    y = 0.8 * x + np.random.default_rng(3).normal(0, 0.006, n)
    res = beta.analyze(y, x, _dates(n))
    assert res["linear"]["beta"]["estimate"] == pytest.approx(0.8, abs=0.03)
    b2 = res["quadratic"]["b2"]
    assert b2["ci_low"] < 0 < b2["ci_high"]
    s = res["quadratic"]["curve"]["sensitivity"]
    assert np.ptp(s) < 0.15
    assert any("not clearly different" in f for f in res["findings"])


def test_quadratic_truth_recovered_and_sensitivity_is_the_derivative() -> None:
    n = 5000
    x = _market(n, 4)
    y = 0.0001 + 1.5 * x + 5.0 * x**2 + np.random.default_rng(5).normal(0, 0.002, n)
    res = beta.analyze(y, x, _dates(n))
    q = res["quadratic"]
    assert q["b1"]["estimate"] == pytest.approx(1.5, abs=0.02)
    assert q["b2"]["estimate"] == pytest.approx(5.0, abs=1.0)
    assert q["b2"]["p_value"] < 0.01
    b1, b2 = q["b1"]["estimate"], q["b2"]["estimate"]
    for row in q["sensitivity_levels"]:
        assert row["estimate"] == pytest.approx(b1 + 2 * b2 * row["benchmark_return"])
        assert row["ci_low"] <= row["estimate"] <= row["ci_high"]
    # the fitted curve and its slope agree numerically
    g = np.asarray(q["curve"]["benchmark_return"])
    f = np.asarray(q["curve"]["fitted_return"])
    np.testing.assert_allclose(
        np.gradient(f, g)[5:-5], np.asarray(q["curve"]["sensitivity"])[5:-5], rtol=1e-3
    )
    assert any("higher when the benchmark rises" in f for f in res["findings"])


def test_asymmetric_truth_shows_in_buckets_and_sensitivity() -> None:
    # beta 1.6 on down days, 0.7 on up days: a kink, not a parabola
    n = 5000
    x = _market(n, 6)
    y = np.where(x < 0, 1.6, 0.7) * x + np.random.default_rng(7).normal(0, 0.003, n)
    res = beta.analyze(y, x, _dates(n))
    buckets = res["buckets"]
    assert buckets[0]["beta"]["estimate"] == pytest.approx(1.6, abs=0.15)
    assert buckets[-1]["beta"]["estimate"] == pytest.approx(0.7, abs=0.15)
    lv = {r["benchmark_return"]: r["estimate"] for r in res["quadratic"]["sensitivity_levels"]}
    assert lv[-0.02] > lv[0.02]
    assert any("higher when the benchmark falls" in f for f in res["findings"])


def test_buckets_partition_the_sample() -> None:
    n = 1000
    x = _market(n, 8)
    res = beta.analyze(1.1 * x, x, _dates(n))
    assert sum(b["n"] for b in res["buckets"]) == n
    assert [b["n"] for b in res["buckets"]] == [100, 150, 250, 250, 150, 100]
    assert [b["original_label"] for b in res["buckets"]][0] == "Bear (<10%)"


def test_sparse_buckets_are_flagged() -> None:
    n = 200
    x = _market(n, 9)
    res = beta.analyze(x + np.random.default_rng(9).normal(0, 0.002, n), x, _dates(n))
    assert res["buckets"][0]["n"] == 20 and res["buckets"][0]["sparse"] is True
    assert res["buckets"][2]["sparse"] is False
    assert any("few in this window" in f for f in res["findings"])


def test_trailing_vol_excludes_the_current_period() -> None:
    x = _market(100, 10)
    vol = beta.trailing_vol(x, 21)
    assert np.isnan(vol[:21]).all()
    for t in (21, 50, 99):
        assert vol[t] == pytest.approx(np.std(x[t - 21 : t], ddof=1))


def test_vol_regimes_split_at_the_median() -> None:
    n = 3000
    x = _market(n, 11)
    y = 1.2 * x + np.random.default_rng(12).normal(0, 0.004, n)
    vr = beta.vol_regimes(y, x)
    lo, hi = vr["regimes"]
    assert abs(lo["n"] - hi["n"]) <= 1
    assert lo["n"] + hi["n"] == n - 21
    assert lo["beta"]["estimate"] == pytest.approx(1.2, abs=0.1)


def test_rolling_betas_match_brute_force() -> None:
    n, w = 300, 60
    x = _market(n, 13)
    y = 0.9 * x + 3 * x**2 + np.random.default_rng(14).normal(0, 0.004, n)
    lin, b1 = beta.rolling_betas(y, x, w)
    assert np.isnan(lin[: w - 1]).all()
    for end in (w - 1, 150, n - 1):
        xs, ys = x[end - w + 1 : end + 1], y[end - w + 1 : end + 1]
        ref_lin = np.polyfit(xs, ys, 1)[0]
        ref_b1 = np.polyfit(xs, ys, 2)[1]
        assert lin[end] == pytest.approx(ref_lin, rel=1e-6)
        assert b1[end] == pytest.approx(ref_b1, rel=1e-5)


def test_winsorizing_clips_each_series() -> None:
    n = 1000
    x = _market(n, 15)
    x[10] = 0.25
    a = beta.analyze(1.0 * x, x, _dates(n))
    b = beta.analyze(1.0 * x, x, _dates(n), do_winsorize=True)
    assert b["benchmark_range"]["high"] < a["benchmark_range"]["high"] or b["winsorized"]
    assert max(b["scatter"]["benchmark"]) < 0.25


# ─── Graceful failures ────────────────────────────────────────────────────────


def test_insufficient_history_message() -> None:
    x = _market(50, 16)
    with pytest.raises(beta.BetaError, match="Only 50 days"):
        beta.analyze(x, x, _dates(50))
    with pytest.raises(beta.BetaError, match="at least 130"):
        beta.analyze(_market(100), _market(100, 1), _dates(100), rolling_window=120)


def test_flat_benchmark_is_rejected() -> None:
    n = 200
    with pytest.raises(beta.BetaError, match="barely moved"):
        beta.analyze(_market(n), np.full(n, 0.0001), _dates(n))


# ─── Return construction ──────────────────────────────────────────────────────


def _prices(n: int = 400) -> tuple[pd.Series, pd.Series]:
    idx = pd.bdate_range("2024-01-01", periods=n)
    m = _market(n, 20)
    a = 1.4 * m + np.random.default_rng(21).normal(0, 0.005, n)
    return (
        pd.Series(100 * np.cumprod(1 + a), index=idx),
        pd.Series(100 * np.cumprod(1 + m), index=idx),
    )


def test_log_and_simple_returns() -> None:
    a, b = _prices()
    d, ra, rb, info = beta.period_returns(a, b, "daily", "simple", "max")
    np.testing.assert_allclose(ra, (a / a.shift(1) - 1).dropna().to_numpy())
    _, la, lb, _ = beta.period_returns(a, b, "daily", "log", "max")
    np.testing.assert_allclose(la, np.log1p(ra))
    assert info["observations"] == len(a) - 1 and info["forward_filled"] == 0


def test_gaps_are_skipped_not_bridged_or_filled() -> None:
    a, b = _prices()
    a.iloc[100] = np.nan  # the asset did not trade that day
    d, ra, rb, info = beta.period_returns(a, b, "daily", "simple", "max")
    # both the return into and out of the gap are dropped; none spans two days
    assert a.index[100] not in d and a.index[101] not in d
    assert len(ra) == len(a) - 3
    assert info["skipped_gaps"] == 1
    ref = (b / b.shift(1) - 1).drop(index=[a.index[0], a.index[100], a.index[101]])
    np.testing.assert_allclose(rb, ref.to_numpy())


def test_listing_date_limits_the_window() -> None:
    a, b = _prices()
    a.iloc[:300] = np.nan
    _, ra, _, info = beta.period_returns(a, b, "daily", "log", "5Y")
    assert info["limited_by_history"] is True and len(ra) == 99


def test_weekly_and_monthly_use_shared_period_ends() -> None:
    a, b = _prices(600)
    d, ra, rb, _ = beta.period_returns(a, b, "weekly", "simple", "max")
    assert all(x.dayofweek == 4 for x in d)  # labelled by the Friday that ends each week
    wk = b.resample("W-FRI").last()
    np.testing.assert_allclose(rb, (wk / wk.shift(1) - 1).dropna().to_numpy())
    dm, *_ = beta.period_returns(a, b, "monthly", "simple", "max")
    assert all(x.is_month_end for x in dm)


def test_lookback_counts_calendar_years_back_from_the_last_shared_date() -> None:
    a, b = _prices(800)
    _, _, _, info = beta.period_returns(a, b, "daily", "log", "1Y")
    end = pd.Timestamp(info["end"])
    assert pd.Timestamp(info["requested_start"]) == end - pd.Timedelta(days=365)


def test_invalid_options_raise() -> None:
    a, b = _prices()
    with pytest.raises(beta.BetaError):
        beta.period_returns(a, b, "hourly", "log", "5Y")  # type: ignore[arg-type]
    with pytest.raises(beta.BetaError):
        beta.period_returns(a, b, "daily", "log", "7Y")


# ─── API ──────────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("installed_snapshot")
def test_api_recovers_the_synthetic_beta() -> None:
    resp = client.get(f"{BASE}/beta", params={"asset": "BBB", "benchmark": "SPY"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["asset"]["ticker"] == "BBB" and body["benchmark"]["ticker"] == "SPY"
    assert body["linear"]["beta"]["estimate"] == pytest.approx(1.5, abs=0.1)
    assert body["data_quality"]["frequency"] == "daily"
    assert body["data_quality"]["return_type"] == "log"
    assert body["as_of"] == "2026-09-25"
    assert len(body["scatter"]["asset"]) == body["observations"]
    assert "s-maxage" in resp.headers["cache-control"]


@pytest.mark.usefixtures("installed_snapshot")
@pytest.mark.parametrize(
    ("params", "status", "text"),
    [
        ({"asset": "ZZZZ"}, 400, "not in the data universe"),
        ({"asset": "SPY", "benchmark": "SPY"}, 400, "different from the asset"),
        ({"asset": "CCC", "lookback": "6M", "freq": "monthly"}, 400, "months of shared history"),
        ({"asset": "BBB", "lookback": "7Y"}, 422, "lookback"),
        ({"asset": "BBB", "window": "5"}, 422, "window"),
        ({"asset": "<script>"}, 400, "ticker symbol"),
    ],
)
def test_api_errors_are_useful(params: dict[str, str], status: int, text: str) -> None:
    resp = client.get(f"{BASE}/beta", params=params)
    assert resp.status_code == status, resp.text
    assert text in resp.json()["error"]


@pytest.mark.usefixtures("installed_snapshot")
def test_api_changes_with_inputs() -> None:
    base = client.get(f"{BASE}/beta", params={"asset": "QQQ"}).json()
    other = client.get(f"{BASE}/beta", params={"asset": "AGG"}).json()
    weekly = client.get(f"{BASE}/beta", params={"asset": "QQQ", "freq": "weekly"}).json()
    short = client.get(f"{BASE}/beta", params={"asset": "QQQ", "lookback": "1Y"}).json()
    assert base["linear"]["beta"]["estimate"] == pytest.approx(1.2, abs=0.05)
    assert abs(other["linear"]["beta"]["estimate"]) < 0.2
    assert weekly["observations"] < base["observations"] / 4
    assert short["observations"] < base["observations"] / 4
    assert short["data_quality"]["start"] > base["data_quality"]["start"]
