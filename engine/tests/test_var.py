import math

import numpy as np
import pandas as pd
import pytest
from scipy import stats

from deanos_engine.models import garch, var


def test_historical_is_empirical_quantile() -> None:
    r = np.random.default_rng(0).normal(0, 0.01, 1000)
    v, es = var.historical(r, 0.95)
    assert v == pytest.approx(-np.quantile(r, 0.05))
    assert es == pytest.approx(-r[r <= np.quantile(r, 0.05)].mean())
    assert es > v


def test_parametric_normal_formulas() -> None:
    r = np.random.default_rng(1).normal(0, 0.02, 5000)
    sd = r.std(ddof=1)
    v, es = var.parametric(r, 0.99)
    assert v == pytest.approx(sd * 2.326348, rel=1e-5)
    assert es == pytest.approx(sd * stats.norm.pdf(2.326348) / 0.01, rel=1e-5)


def test_fhs_close_to_normal_for_iid_normal_returns() -> None:
    r = pd.Series(np.random.default_rng(2).normal(0, 0.01, 4000))
    m = garch.fit(r)
    v, _ = var.filtered_historical(m, 0.95)
    assert v == pytest.approx(0.01 * 1.645, rel=0.15)


def test_kupiec_matches_hand_calculation() -> None:
    n, x, p = 250, 8, 0.01
    phat = x / n
    ref = -2 * (
        (n - x) * math.log(1 - p)
        + x * math.log(p)
        - (n - x) * math.log(1 - phat)
        - x * math.log(phat)
    )
    out = var.kupiec_pof(x, n, 0.99)
    assert out["lr"] == pytest.approx(ref)
    assert out["p_value"] == pytest.approx(stats.chi2.sf(ref, 1))
    assert var.kupiec_pof(0, 250, 0.99)["lr"] == pytest.approx(-2 * 250 * math.log(0.99))


def test_christoffersen_detects_clustering() -> None:
    clustered = np.zeros(500, dtype=bool)
    clustered[100:110] = True
    clustered[300:310] = True
    assert var.christoffersen_independence(clustered)["p_value"] < 0.001
    rng = np.random.default_rng(3)
    iid = rng.random(2000) < 0.05
    assert var.christoffersen_independence(iid)["p_value"] > 0.01


def test_component_var_sums_to_parametric() -> None:
    rng = np.random.default_rng(4)
    x = rng.multivariate_normal([0, 0, 0], [[1, 0.5, 0.2], [0.5, 1, 0.3], [0.2, 0.3, 2]], 3000)
    x *= 0.01
    w = np.array([0.5, 0.3, 0.2])
    comp = var.component_var(w, x, 0.95)
    total, _ = var.parametric(x @ w, 0.95)
    assert comp.sum() == pytest.approx(total)


def test_backtest_on_iid_normal_has_correct_coverage() -> None:
    rng = np.random.default_rng(5)
    r = pd.Series(rng.normal(0, 0.01, 1300), index=pd.bdate_range("2020-01-01", periods=1300))
    fc = var.rolling_forecasts(r, test_days=750, window=500)
    realized = np.asarray(r, dtype=np.float64)[-750:]
    for method in fc:
        ev = var.evaluate(realized, fc[method][0.95], 0.95)
        assert 0.025 < ev["breach_rate"] < 0.08, method
        # Each forecast uses only earlier data: shifting future returns must not change it.
    assert fc["historical"][0.95][0] == pytest.approx(-np.quantile(r.to_numpy()[50:550], 0.05))
