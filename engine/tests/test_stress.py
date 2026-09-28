import numpy as np
import pandas as pd
import pytest

from deanos_engine.data import Snapshot
from deanos_engine.models import stress

COVID = next(s for s in stress.SCENARIOS if s.id == "covid")


def test_replay_uses_actual_returns(snapshot: Snapshot) -> None:
    prices = snapshot.prices[["AAA", "AGG"]]
    w = np.array([0.7, 0.3])
    out = stress.replay(prices, snapshot.prices["SPY"], w, COVID)
    assert out is not None
    start, end = pd.Timestamp(COVID.start), pd.Timestamp(COVID.end)
    for t in ("AAA", "AGG"):
        s = snapshot.prices[t].loc[start:end]
        assert out["holdings"][t]["method"] == "replay"
        assert out["holdings"][t]["return"] == pytest.approx(s.iloc[-1] / s.iloc[0] - 1)
    # Buy and hold: portfolio return is the weighted sum of holding returns.
    total = sum(w[i] * out["holdings"][t]["return"] for i, t in enumerate(prices))
    assert out["portfolio"]["return"] == pytest.approx(total)
    assert out["share_replayed"] == pytest.approx(1.0)


def test_unlisted_holding_is_beta_scaled_and_labeled(snapshot: Snapshot) -> None:
    gfc = next(s for s in stress.SCENARIOS if s.id == "gfc")
    out = stress.replay(snapshot.prices[["BBB"]], snapshot.prices["SPY"], np.array([1.0]), gfc)
    assert out is not None
    h = out["holdings"]["BBB"]
    assert h["method"] == "beta_scaled"
    assert h["beta_used"] == pytest.approx(1.5, abs=0.15)
    spy = snapshot.prices["SPY"].loc[gfc.start : gfc.end].pct_change().dropna()
    assert h["return"] == pytest.approx(np.prod(1 + h["beta_used"] * spy) - 1)
    assert out["share_replayed"] == 0.0


def test_custom_shock_is_linear() -> None:
    sens = {
        "A": {"beta_market": 1.2, "beta_treasury": 0.0, "r_squared": 0.9},
        "B": {"beta_market": 0.0, "beta_treasury": 1.0, "r_squared": 0.9},
    }
    out = stress.custom_shock(sens, np.array([0.5, 0.5]), -0.2, 100, ief_duration=7.5)
    assert out["holdings"]["A"]["move"] == pytest.approx(-0.24)
    assert out["holdings"]["B"]["move"] == pytest.approx(-0.075)
    assert out["portfolio_move"] == pytest.approx(0.5 * -0.24 + 0.5 * -0.075)


def test_sensitivities_recover_betas(snapshot: Snapshot) -> None:
    rets = snapshot.prices[["CCC"]].pct_change().dropna()
    s = stress.sensitivities(
        rets, snapshot.prices["SPY"].pct_change(), snapshot.prices["IEF"].pct_change()
    )
    assert s["CCC"]["beta_market"] == pytest.approx(0.5, abs=0.15)
    assert s["CCC"]["beta_treasury"] == pytest.approx(-0.3, abs=0.2)
