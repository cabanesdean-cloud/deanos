import numpy as np
import pandas as pd
import pytest

from deanos_engine.models import montecarlo
from deanos_engine.resample import circular_block_indices
from tests.helpers import garch_returns


def _series(r: np.ndarray) -> pd.Series:
    return pd.Series(r, index=pd.bdate_range("2010-01-01", periods=r.size))


def test_block_indices_are_consecutive_runs() -> None:
    idx = circular_block_indices(100, 50, 3, 10, np.random.default_rng(0))
    assert idx.shape == (3, 50)
    for row in idx:
        for b in range(5):
            run = row[b * 10 : (b + 1) * 10]
            assert np.all(np.diff(run) % 100 == 1)


def test_reproducible_and_ordered() -> None:
    r = _series(np.random.default_rng(1).normal(0.0004, 0.01, 2000))
    a = montecarlo.simulate(r, n_paths=1000)
    b = montecarlo.simulate(r, n_paths=1000)
    assert a["final"] == b["final"]
    f = a["final"]
    assert f["p5"] < f["p25"] < f["p50"] < f["p75"] < f["p95"]
    assert a["fan"]["p50"][0] == pytest.approx(10_000)
    assert a["fan"]["days"][-1] == 252


def test_zero_mean_mode_removes_drift() -> None:
    r = _series(np.random.default_rng(2).normal(0.002, 0.005, 2000))
    hist = montecarlo.simulate(r, n_paths=2000, mean_mode="historical")
    zero = montecarlo.simulate(r, n_paths=2000, mean_mode="zero")
    assert hist["final"]["p50"] > 1.5 * 10_000
    assert zero["final"]["mean"] == pytest.approx(10_000, rel=0.01)


def test_block_bootstrap_preserves_volatility_clustering() -> None:
    rng = np.random.default_rng(3)
    r = _series(garch_returns(5000, rng, omega=1e-6, alpha=0.1, beta=0.88))

    def sq_autocorr(block: int) -> float:
        idx = circular_block_indices(r.size, 252, 400, block, np.random.default_rng(4))
        x = r.to_numpy()[idx] ** 2
        a, b = x[:, :-1].ravel(), x[:, 1:].ravel()
        return float(np.corrcoef(a, b)[0, 1])

    assert sq_autocorr(21) > sq_autocorr(1) + 0.05
