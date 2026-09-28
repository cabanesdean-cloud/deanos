import numpy as np
import pandas as pd
import pytest

from deanos_engine.models import metrics


def test_cagr_exact() -> None:
    r = np.full(252, 1.10 ** (1 / 252) - 1)
    assert metrics.cagr(r) == pytest.approx(0.10)


def test_max_drawdown_known_path() -> None:
    # 100 -> 120 -> 90 -> 130: deepest drawdown is 90/120 - 1 = -25%
    r = np.array([0.2, 90 / 120 - 1, 130 / 90 - 1])
    assert metrics.max_drawdown(r) == pytest.approx(-0.25)
    ep = metrics.max_drawdown_episode(pd.Series(r, index=pd.bdate_range("2024-01-01", periods=3)))
    assert ep["depth"] == pytest.approx(-0.25)
    assert str(ep["peak"].date()) == "2024-01-01"
    assert str(ep["trough"].date()) == "2024-01-02"
    assert str(ep["recovery"].date()) == "2024-01-03"


def test_sharpe_and_sortino_match_definitions() -> None:
    rng = np.random.default_rng(1)
    r = rng.normal(0.0005, 0.01, 2000)
    rf = 0.0001
    ex = r - rf
    assert metrics.sharpe(r, rf) == pytest.approx(ex.mean() / ex.std(ddof=1) * np.sqrt(252))
    dd = np.sqrt(np.mean(np.minimum(ex, 0) ** 2))
    assert metrics.sortino(r, rf) == pytest.approx(ex.mean() / dd * np.sqrt(252))


def test_beta_and_asymmetric_betas() -> None:
    rng = np.random.default_rng(2)
    m = rng.normal(0, 0.01, 5000)
    assert metrics.beta(2 * m, m) == pytest.approx(2.0)
    a = np.where(m > 0, 0.5 * m, 1.5 * m)
    up, down = metrics.up_down_beta(a, m)
    assert up == pytest.approx(0.5)
    assert down == pytest.approx(1.5)


def test_risk_contributions() -> None:
    rng = np.random.default_rng(3)
    x = rng.normal(0, 0.01, (20_000, 3))
    rc = metrics.risk_contributions(np.array([1 / 3] * 3), x)
    assert rc.sum() == pytest.approx(1.0)
    np.testing.assert_allclose(rc, 1 / 3, atol=0.02)


def test_concentration() -> None:
    c = metrics.concentration(np.array([0.25] * 4))
    assert c["herfindahl"] == pytest.approx(0.25)
    assert c["effective_holdings"] == pytest.approx(4.0)
    assert c["top3_weight"] == pytest.approx(0.75)


def test_bootstrap_intervals_bracket_point_estimates() -> None:
    rng = np.random.default_rng(4)
    r = rng.normal(0.0004, 0.01, 2520)
    rf = np.zeros_like(r)
    iv = metrics.bootstrap_intervals(r, rf, n_boot=400)
    assert iv["volatility"]["low"] < metrics.annualized_vol(r) < iv["volatility"]["high"]
    assert iv["sharpe"]["low"] < metrics.sharpe(r) < iv["sharpe"]["high"]
    assert iv["max_drawdown"]["low"] < iv["max_drawdown"]["high"] <= 0
