import itertools

import numpy as np
import pandas as pd
import pytest
from scipy.stats import norm

from deanos_engine.models import regime


def test_cap_confidence_redistributes_proportionally() -> None:
    p = regime.cap_confidence(np.array([0.99, 0.006, 0.004, 0.0]))
    assert p.max() == pytest.approx(0.95)
    assert p.sum() == pytest.approx(1.0)
    assert p[1] / p[2] == pytest.approx(0.006 / 0.004)
    assert p[3] == 0.0


def test_cap_confidence_spreads_evenly_when_others_zero() -> None:
    p = regime.cap_confidence(np.array([1.0, 0.0, 0.0, 0.0]))
    np.testing.assert_allclose(p, [0.95, 0.05 / 3, 0.05 / 3, 0.05 / 3])


def test_cap_confidence_leaves_low_confidence_alone() -> None:
    p = np.array([0.5, 0.3, 0.2])
    np.testing.assert_allclose(regime.cap_confidence(p), p)


def test_forward_filter_matches_brute_force() -> None:
    """P(s_t | x_1..t) by enumerating every state path on a tiny model."""
    start = np.array([0.6, 0.4])
    trans = np.array([[0.9, 0.1], [0.2, 0.8]])
    x = np.array([0.1, -1.5, 2.0, 0.3])
    means, sds = np.array([0.0, 0.5]), np.array([1.0, 2.0])
    emis = norm.pdf(x[:, None], means[None, :], sds[None, :])
    got = regime.forward_filter(np.log(emis), start, trans)
    for t in range(len(x)):
        joint = np.zeros(2)
        for path in itertools.product(range(2), repeat=t + 1):
            pr = start[path[0]] * emis[0, path[0]]
            for k in range(1, t + 1):
                pr *= trans[path[k - 1], path[k]] * emis[k, path[k]]
            joint[path[-1]] += pr
        np.testing.assert_allclose(got[t], joint / joint.sum(), rtol=1e-10)


def test_forward_filter_uses_no_future_data() -> None:
    rng = np.random.default_rng(0)
    log_b = rng.normal(size=(200, 4))
    start = np.full(4, 0.25)
    trans = np.full((4, 4), 0.05) + np.eye(4) * 0.8
    full = regime.forward_filter(log_b, start, trans)
    head = regime.forward_filter(log_b[:120], start, trans)
    np.testing.assert_allclose(full[:120], head)


def test_label_states_orders_by_volatility_and_ignores_state_numbering() -> None:
    vol = np.array([0.02, 0.005, 0.01, 0.04, 0.02, 0.005])
    seq = np.array([2, 0, 1, 3, 2, 0])
    assert regime.label_states(seq, vol) == {0: "calm", 1: "normal", 2: "volatile", 3: "crisis"}
    # Renumbering the same states gives the same names for the same days.
    perm = np.array([3, 1, 0, 2])
    renamed = regime.label_states(perm[seq], vol)
    assert [renamed[int(s)] for s in perm[seq]] == [
        {0: "calm", 1: "normal", 2: "volatile", 3: "crisis"}[int(s)] for s in seq
    ]


def test_market_regimes_on_synthetic_spy() -> None:
    rng = np.random.default_rng(2)
    calm = rng.normal(0.0006, 0.007, 1500)
    storm = rng.normal(-0.003, 0.035, 120)
    r = np.concatenate([calm, storm, calm[:800]])
    spy = pd.Series(r, index=pd.bdate_range("2010-01-01", periods=r.size))
    out = regime.market_regimes(spy, n_starts=3)
    labels = out["_labels"]
    storm_days = labels.iloc[1500 - 59 + 40 : 1500 - 59 + 110]
    # The storm reads as crisis, easing to volatile as 20-day volatility decays.
    assert storm_days.isin(["crisis", "volatile"]).mean() > 0.95
    assert (storm_days == "crisis").mean() > 0.6
    assert (labels.iloc[:1400] == "crisis").mean() < 0.05
    assert len(out["history"]["spy_growth"]) == len(out["history"]["dates"])
    probs = out["current"]["probabilities"]
    assert sum(probs.values()) == pytest.approx(1.0)
    assert max(probs.values()) <= 0.95 + 1e-12
    st = out["stability"]
    lls = [row["log_likelihood"] for row in st["starts"]]
    assert lls == sorted(lls, reverse=True)
    assert st["starts"][0]["agreement"] == 1.0
    assert 0 <= st["agreement_next_best"] <= 1


def test_payload_round_trip_and_precomputed_use() -> None:
    rng = np.random.default_rng(5)
    r = rng.normal(0.0004, 0.01, 800)
    spy = pd.Series(r, index=pd.bdate_range("2020-01-01", periods=r.size))
    market = regime.market_regimes(spy, n_starts=2)
    payload = regime.to_payload(market)
    back = regime.from_payload(payload)
    pd.testing.assert_series_equal(
        back["_labels"],
        market["_labels"],
        check_names=False,
        check_freq=False,
        check_index_type=False,
    )
    # A stale payload (different last date) is ignored and the model refits.
    stale = {**payload, "sample": {**payload["sample"], "end": "1999-01-01"}}
    fresh = regime.analyze(spy, spy, precomputed=stale)
    assert fresh["sample"]["end"] == payload["sample"]["end"]
    used = regime.analyze(spy, spy, precomputed={**payload, "model": "precomputed-marker"})
    assert used["model"] == "precomputed-marker"
