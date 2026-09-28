"""Monte Carlo projection of portfolio value by block bootstrap.

Each simulated path strings together randomly chosen runs of consecutive
historical days. Every simulated day is a real day for all holdings at once,
so cross-asset correlation is preserved (the private model's correlated
bootstrap). Sampling runs of days rather than single days also preserves
volatility clustering: calm and turbulent stretches stay together.

Expected return has two modes:

- ``historical``: the sample's own average return.
- ``zero``: each day's return is shifted so the average daily return is zero.
  This isolates risk from the return assumption, which is the least reliable
  input.
"""

from __future__ import annotations

from typing import Any, Literal

import numpy as np
import pandas as pd

from deanos_engine.resample import circular_block_indices

TRADING_DAYS = 252
PERCENTILES = (5, 25, 50, 75, 95)
MeanMode = Literal["historical", "zero"]


def simulate(
    portfolio_returns: pd.Series,
    horizon: int = TRADING_DAYS,
    n_paths: int = 5000,
    block: int = 21,
    mean_mode: MeanMode = "historical",
    start_value: float = 10_000.0,
    seed: int = 42,
    sample_every: int = 5,
) -> dict[str, Any]:
    r = portfolio_returns.to_numpy(dtype=np.float64)
    if mean_mode == "zero":
        r = r - r.mean()
    rng = np.random.default_rng(seed)
    idx = circular_block_indices(r.size, horizon, n_paths, block, rng)
    daily = r[idx]
    wealth = np.cumprod(1.0 + daily, axis=1)
    paths = start_value * wealth
    final = paths[:, -1]

    days = list(range(0, horizon + 1, sample_every))
    if days[-1] != horizon:
        days.append(horizon)
    with_start = np.concatenate([np.full((n_paths, 1), start_value), paths], axis=1)
    fan = {f"p{q}": np.percentile(with_start[:, days], q, axis=0) for q in PERCENTILES}

    peak = np.maximum.accumulate(np.concatenate([np.ones((n_paths, 1)), wealth], axis=1), axis=1)
    path_mdd = (wealth / peak[:, 1:] - 1.0).min(axis=1)

    def prob(mask: np.ndarray) -> dict[str, float]:
        p = float(mask.mean())
        return {"p": p, "std_error": float(np.sqrt(p * (1 - p) / n_paths))}

    edges = np.percentile(final, [0.5, 99.5])
    bins = np.linspace(edges[0], edges[1], 41)
    counts, _ = np.histogram(np.clip(final, bins[0], bins[-1]), bins=bins)

    years = r.size / TRADING_DAYS
    return {
        "start_value": start_value,
        "horizon_days": horizon,
        "paths": n_paths,
        "fan": {"days": days, **fan},
        "final": {f"p{q}": float(np.percentile(final, q)) for q in (5, 10, 25, 50, 75, 90, 95)}
        | {"mean": float(final.mean())},
        "probabilities": {
            "loss": prob(final < start_value),
            "loss_10pct": prob(final < 0.9 * start_value),
            "loss_20pct": prob(final < 0.8 * start_value),
            "gain_25pct": prob(final > 1.25 * start_value),
        },
        "path_max_drawdown": {
            "p50": float(np.percentile(path_mdd, 50)),
            "p95_worst": float(np.percentile(path_mdd, 5)),
        },
        "histogram": {"edges": bins, "counts": counts},
        "assumptions": {
            "method": "circular block bootstrap of historical daily portfolio returns",
            "block_days": block,
            "mean_mode": mean_mode,
            "sample_start": str(portfolio_returns.index[0].date()),
            "sample_end": str(portfolio_returns.index[-1].date()),
            "sample_years": years,
            "sample_mean_daily": float(portfolio_returns.mean()),
            "rebalancing": "daily, to target weights",
            "seed": seed,
            "notes": [
                "Only days that occurred in the sample can occur in a simulation.",
                "Losses worse than the worst sampled stretch are not possible.",
                "Fees, taxes, contributions and withdrawals are ignored.",
            ],
        },
    }
