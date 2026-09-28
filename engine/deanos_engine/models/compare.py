"""Side-by-side comparison of two portfolios over the same dates.

Used both for "compare two portfolios" and for hypothetical changes (the
current portfolio against an edited copy). Replaces the private model's
comparison against Dean's live holdings and its sector-ETF comparison.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from deanos_engine.models import metrics, montecarlo, stress, var
from deanos_engine.portfolio import PortfolioData


def _profile(
    p: PortfolioData, prices: pd.DataFrame, spy_prices: pd.Series, spy_returns: pd.Series
) -> dict[str, Any]:
    r = p.portfolio_returns.to_numpy(dtype=np.float64)
    f = p.rf.to_numpy(dtype=np.float64)
    h95 = var.historical(r, 0.95)
    mc = montecarlo.simulate(p.portfolio_returns, n_paths=2000)
    scen = {
        s["id"]: s["portfolio"]["return"]
        for sc in stress.SCENARIOS
        if (s := stress.replay(prices, spy_prices, p.weights, sc)) is not None
    }
    spy = spy_returns.reindex(p.portfolio_returns.index).to_numpy(dtype=np.float64)
    return {
        "holdings": dict(zip(p.tickers, p.weights, strict=True)),
        "cagr": metrics.cagr(r),
        "volatility": metrics.annualized_vol(r),
        "sharpe": metrics.sharpe(r, f),
        "max_drawdown": metrics.max_drawdown(r),
        "beta": metrics.beta(r, spy),
        "var95_historical": h95[0],
        "es95_historical": h95[1],
        "simulation_1y": {
            "p5": mc["final"]["p5"] / mc["start_value"] - 1,
            "p50": mc["final"]["p50"] / mc["start_value"] - 1,
            "p95": mc["final"]["p95"] / mc["start_value"] - 1,
            "probability_of_loss": mc["probabilities"]["loss"]["p"],
        },
        "stress": scen,
        "growth": np.cumprod(1 + r),
    }


def analyze(
    a: PortfolioData,
    b: PortfolioData,
    prices_a: pd.DataFrame,
    prices_b: pd.DataFrame,
    spy_prices: pd.Series,
) -> dict[str, Any]:
    spy_returns = spy_prices.pct_change()
    pa = _profile(a, prices_a, spy_prices, spy_returns)
    pb = _profile(b, prices_b, spy_prices, spy_returns)
    keys = ["cagr", "volatility", "sharpe", "max_drawdown", "beta", "var95_historical"]
    step = 5
    idx = list(range(0, len(a.portfolio_returns), step))
    return {
        "window": {k: a.data_quality[k] for k in ("start", "end", "trading_days")},
        "a": {k: v for k, v in pa.items() if k != "growth"},
        "b": {k: v for k, v in pb.items() if k != "growth"},
        "difference": {k: pb[k] - pa[k] for k in keys},
        "growth": {
            "dates": [str(a.portfolio_returns.index[i].date()) for i in idx],
            "a": pa["growth"][idx],
            "b": pb["growth"][idx],
        },
    }
