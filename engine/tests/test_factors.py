import numpy as np
import pandas as pd
import pytest
import statsmodels.api as sm

from deanos_engine.models import factors


def _factor_frame(n: int, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(
        rng.normal(0, 0.006, (n, 6)),
        columns=list(factors.FACTORS),
        index=pd.bdate_range("2015-01-01", periods=n),
    )
    df["RF"] = 0.0001
    return df


def test_recovers_known_loadings() -> None:
    f = _factor_frame(2000)
    true = np.array([1.1, 0.4, -0.3, 0.2, 0.0, 0.15])
    rng = np.random.default_rng(1)
    p = f["RF"] + f[list(factors.FACTORS)].to_numpy() @ true + rng.normal(0, 0.002, len(f))
    out = factors.analyze(pd.Series(p, index=f.index), f)
    got = np.array([out["loadings"][k]["beta"] for k in factors.FACTORS])
    np.testing.assert_allclose(got, true, atol=0.03)
    assert out["r_squared"] > 0.9
    assert abs(out["alpha"]["annualized"]) < 0.05
    assert out["max_vif"] < 1.1


def test_newey_west_errors_match_statsmodels() -> None:
    f = _factor_frame(1500, seed=2)
    rng = np.random.default_rng(3)
    p = f["RF"] + 0.9 * f["Mkt-RF"] + rng.normal(0, 0.004, len(f))
    out = factors.analyze(pd.Series(p, index=f.index), f)
    lags = factors.newey_west_lags(len(f))
    ref = sm.OLS(p - f["RF"], sm.add_constant(f[list(factors.FACTORS)])).fit(
        cov_type="HAC", cov_kwds={"maxlags": lags}
    )
    assert out["loadings"]["Mkt-RF"]["std_error"] == pytest.approx(ref.bse["Mkt-RF"])
    assert out["newey_west_lags"] == lags == 7  # floor(4 * 15 ** (2/9))


def test_vif_flags_collinearity() -> None:
    rng = np.random.default_rng(4)
    a = rng.normal(size=2000)
    x = np.column_stack([a, a + rng.normal(0, 0.05, 2000), rng.normal(size=2000)])
    v = factors.vif(x)
    assert v[0] > 100 and v[1] > 100
    assert v[2] == pytest.approx(1.0, abs=0.05)


def test_requires_a_year_of_overlap() -> None:
    f = _factor_frame(200)
    with pytest.raises(ValueError, match="one year"):
        factors.analyze(pd.Series(0.0, index=f.index), f)
