"""Checks against the real market data snapshot and well-known history.

Skipped when ``engine/.data/snapshot.npz`` is absent (CI builds no snapshot).
The nightly workflow's smoke test covers the published snapshot.
"""

import numpy as np
import pandas as pd
import pytest

from deanos_engine.data import DataUnavailableError, Snapshot, load_snapshot
from deanos_engine.data.snapshot import DEFAULT_LOCAL_PATH
from deanos_engine.models import factors, garch, montecarlo, regime, stress, var
from deanos_engine.portfolio import parse_portfolio, prepare

pytestmark = pytest.mark.realdata


@pytest.fixture(scope="module")
def snap() -> Snapshot:
    if not DEFAULT_LOCAL_PATH.exists():
        pytest.skip("no local snapshot")
    try:
        return load_snapshot(DEFAULT_LOCAL_PATH)
    except DataUnavailableError as exc:
        pytest.skip(str(exc))


def _ret(snap: Snapshot, t: str) -> pd.Series:
    return snap.prices[t].dropna().pct_change().dropna()


def test_universe_integrity(snap: Snapshot) -> None:
    assert snap.prices.shape[1] >= 500
    spy = snap.prices["SPY"]
    assert spy.notna().all()
    assert (snap.prices.min(skipna=True) > 0).all()
    assert snap.prices.index.is_monotonic_increasing
    assert not snap.prices.index.has_duplicates
    etfs = [t for t, i in snap.universe.items() if i.get("kind") == "etf"]
    moves = snap.prices[etfs].pct_change(fill_method=None).abs()
    assert (moves.max() < 0.5).all(), moves.max().sort_values().tail()


@pytest.mark.parametrize(
    ("scenario", "low", "high"),
    [
        ("gfc", -0.58, -0.52),
        ("covid", -0.36, -0.32),
        ("bear_2022", -0.27, -0.22),
        ("dotcom", -0.50, -0.44),
    ],
)
def test_spy_crisis_returns_match_history(
    snap: Snapshot, scenario: str, low: float, high: float
) -> None:
    sc = next(s for s in stress.SCENARIOS if s.id == scenario)
    out = stress.replay(snap.prices[["SPY"]], snap.prices["SPY"], np.array([1.0]), sc)
    assert out is not None
    assert low <= out["spy"]["return"] <= high


def test_factor_loadings_of_known_funds(snap: Snapshot) -> None:
    def fit(t: str) -> dict:  # type: ignore[type-arg]
        return factors.analyze(_ret(snap, t).iloc[-1260:], snap.factors)

    spy = fit("SPY")
    assert 0.95 <= spy["loadings"]["Mkt-RF"]["beta"] <= 1.05
    assert spy["r_squared"] > 0.97
    assert fit("IWM")["loadings"]["SMB"]["beta"] > 0.5  # small caps load on size
    assert (
        fit("IVE")["loadings"]["HML"]["beta"] > fit("IVW")["loadings"]["HML"]["beta"]
    )  # value vs growth


def test_spy_garch_is_persistent_and_well_specified(snap: Snapshot) -> None:
    m = garch.fit(_ret(snap, "SPY").iloc[-2520:])
    assert m.method == "garch"
    assert 0.95 < m.persistence < 0.999


def test_regime_labels_known_episodes(snap: Snapshot) -> None:
    labels: pd.Series = regime.market_regimes(_ret(snap, "SPY"))["_labels"]
    assert labels.loc["2008-10-06":"2008-11-21"].isin(["crisis"]).mean() > 0.8
    assert labels.loc["2020-03-09":"2020-04-09"].isin(["crisis"]).mean() > 0.8
    assert labels.loc["2017-01-01":"2017-12-31"].isin(["calm", "normal"]).mean() > 0.9


def test_balanced_var_backtest_coverage(snap: Snapshot) -> None:
    d = prepare(snap, parse_portfolio("VTI:35,VEA:15,VWO:5,AGG:25,TIP:5,VNQ:5,GLD:10"))
    fc = var.rolling_forecasts(d.portfolio_returns, test_days=750)
    ev = var.evaluate(d.portfolio_returns.to_numpy()[-750:], fc["filtered_historical"][0.95], 0.95)
    assert 0.03 <= ev["breach_rate"] <= 0.07


def test_zero_mean_simulation_has_volatility_drag(snap: Snapshot) -> None:
    d = prepare(snap, parse_portfolio("SPY:1"), lookback_days=15 * 252)
    out = montecarlo.simulate(d.portfolio_returns, mean_mode="zero", n_paths=4000)
    assert out["final"]["p50"] < out["start_value"]
    assert out["final"]["mean"] == pytest.approx(out["start_value"], rel=0.02)
