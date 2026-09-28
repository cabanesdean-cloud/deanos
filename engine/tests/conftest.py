"""Shared fixtures: a synthetic market snapshot with known structure."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from deanos_engine.data import Snapshot, set_snapshot
from tests.helpers import garch_returns


def make_snapshot(seed: int = 0) -> Snapshot:
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2000-01-03", "2026-09-25")
    n = len(dates)
    market = garch_returns(n, rng) + 0.0003
    rates = rng.normal(0.0001, 0.004, n)
    rets = {
        "SPY": market,
        "QQQ": 1.2 * market + rng.normal(0, 0.006, n),
        "IEF": rates,
        "AGG": 0.6 * rates + rng.normal(0.0001, 0.001, n),
        "AAA": 0.8 * market + rng.normal(0.0002, 0.01, n),
        "BBB": 1.5 * market + rng.normal(0, 0.012, n),
        "CCC": 0.5 * market - 0.3 * rates + rng.normal(0, 0.008, n),
    }
    # Twenty more stocks so a maximum-size (25 holding) portfolio can be tested.
    for k in range(1, 21):
        rets[f"S{k:02d}"] = rng.uniform(0.5, 1.5) * market + rng.normal(0, 0.012, n)
    prices = pd.DataFrame({t: 100 * np.cumprod(1 + r) for t, r in rets.items()}, index=dates)
    prices.loc[:"2014-12-31", "BBB"] = np.nan  # listed 2015
    prices.loc[:"2025-12-31", "CCC"] = np.nan  # listed 2026: under a year of history

    fdates = dates[dates <= pd.Timestamp("2026-07-31")]  # factor data lags prices
    m = len(fdates)
    mkt_rf = market[:m] - 0.0001
    factors = pd.DataFrame(
        {
            "Mkt-RF": mkt_rf,
            "SMB": rng.normal(0, 0.005, m),
            "HML": rng.normal(0, 0.005, m),
            "RMW": rng.normal(0, 0.004, m),
            "CMA": rng.normal(0, 0.003, m),
            "Mom": rng.normal(0, 0.007, m),
            "RF": np.full(m, 0.0001),
        },
        index=fdates,
    )
    universe = {t: {"name": f"{t} test", "sector": "Test", "kind": "etf"} for t in prices}
    return Snapshot(prices=prices, factors=factors, meta={"universe": universe})


@pytest.fixture(scope="session")
def snapshot() -> Snapshot:
    return make_snapshot()


@pytest.fixture()
def installed_snapshot(snapshot: Snapshot):  # type: ignore[no-untyped-def]
    set_snapshot(snapshot)
    yield snapshot
    set_snapshot(None)
