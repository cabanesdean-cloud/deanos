import numpy as np
import pandas as pd
import pytest
from arch import arch_model

from deanos_engine.models import garch
from tests.helpers import garch_returns


@pytest.fixture(scope="module")
def sim() -> pd.Series:
    rng = np.random.default_rng(11)
    r = garch_returns(6000, rng, omega=2e-6, alpha=0.08, beta=0.9)
    return pd.Series(r, index=pd.bdate_range("2000-01-03", periods=r.size))


def test_fit_recovers_parameters(sim: pd.Series) -> None:
    m = garch.fit(sim)
    assert m.method == "garch"
    assert m.alpha == pytest.approx(0.08, abs=0.02)
    assert m.beta == pytest.approx(0.90, abs=0.03)
    assert m.persistence < 1


def test_variance_path_matches_arch_reference(sim: pd.Series) -> None:
    m = garch.fit(sim)
    res = arch_model(sim * 100, mean="Constant", vol="GARCH", p=1, q=1, rescale=False).fit(
        disp="off"
    )
    ref = res.forecast(horizon=63).variance.to_numpy()[-1] / 1e4
    np.testing.assert_allclose(m.variance_path(63), ref, rtol=1e-3)


def test_average_forecast_is_mean_variance_not_endpoint(sim: pd.Series) -> None:
    m = garch.fit(sim)
    path = m.variance_path(21)
    assert m.average_vol(21) == pytest.approx(np.sqrt(path.mean() * 252))
    lo, hi = sorted([m.point_vol(1), m.point_vol(21)])
    assert lo <= m.average_vol(21) <= hi


def test_residual_diagnostics_pass_for_correct_model(sim: pd.Series) -> None:
    d = garch.fit(sim).diagnostics
    assert d["squared_residuals"]["p_value"] > 0.01


def test_ewma_fallback_on_short_series() -> None:
    r = pd.Series(np.random.default_rng(0).normal(0, 0.01, 100))
    m = garch.fit(r)
    assert m.method == "ewma"
    assert m.fallback_reason == "fewer than 250 observations"
    np.testing.assert_allclose(m.variance_path(10), m.next_variance)


def test_ewma_recursion() -> None:
    r = pd.Series([0.01, -0.02, 0.015, 0.0, -0.01] * 10)
    m = garch.ewma(r, "test")
    var = np.mean(r.to_numpy()[:30] ** 2)
    for x in r.to_numpy():
        var = 0.94 * var + 0.06 * x * x
    assert m.next_variance == pytest.approx(var)


def test_degenerate_fit_falls_back(monkeypatch: pytest.MonkeyPatch, sim: pd.Series) -> None:
    class FakeRes:
        params = pd.Series({"mu": 0.0, "omega": 0.01, "alpha[1]": 0.0, "beta[1]": 0.999})
        convergence_flag = 0
        conditional_volatility = np.ones(len(sim))

    class FakeModel:
        def fit(self, **_: object) -> FakeRes:
            return FakeRes()

    import arch

    monkeypatch.setattr(arch, "arch_model", lambda *a, **k: FakeModel())
    m = garch.fit(sim)
    assert m.method == "ewma"
    assert "degenerate" in (m.fallback_reason or "")
