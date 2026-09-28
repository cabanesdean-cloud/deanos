"""Portfolio performance and risk metrics.

Ported from the private ``risk_metrics.py`` with these changes:

- Returns are annualized geometrically (CAGR), not by compounding the mean day.
- Sharpe and Sortino use the daily Fama-French risk-free rate, not a fixed 4%.
- Sortino uses target downside deviation (root mean square of below-zero excess
  returns over all days) instead of the standard deviation of negative days.
- Up and down betas are regression slopes on up-market and down-market days,
  not ratios of mean returns.
- Headline figures come with block-bootstrap ranges.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from deanos_engine.resample import circular_block_indices

TRADING_DAYS = 252
FloatArray = npt.NDArray[np.float64]


def cagr(returns: FloatArray) -> float:
    r = np.asarray(returns, dtype=np.float64)
    if r.size == 0:
        return float("nan")
    growth = float(np.prod(1.0 + r))
    if growth <= 0:
        return -1.0
    return float(growth ** (TRADING_DAYS / r.size) - 1.0)


def annualized_vol(returns: FloatArray) -> float:
    r = np.asarray(returns, dtype=np.float64)
    if r.size < 2:
        return float("nan")
    return float(np.std(r, ddof=1) * np.sqrt(TRADING_DAYS))


def sharpe(returns: FloatArray, rf: FloatArray | float = 0.0) -> float:
    excess = np.asarray(returns, dtype=np.float64) - rf
    if excess.size < 2:
        return float("nan")
    sd = float(np.std(excess, ddof=1))
    if sd == 0:
        return float("nan")
    return float(np.mean(excess) / sd * np.sqrt(TRADING_DAYS))


def sortino(returns: FloatArray, rf: FloatArray | float = 0.0) -> float:
    excess = np.asarray(returns, dtype=np.float64) - rf
    if excess.size < 2:
        return float("nan")
    downside = float(np.sqrt(np.mean(np.minimum(excess, 0.0) ** 2)))
    if downside == 0:
        return float("nan")
    return float(np.mean(excess) / downside * np.sqrt(TRADING_DAYS))


def drawdown_series(returns: FloatArray) -> FloatArray:
    wealth = np.cumprod(1.0 + np.asarray(returns, dtype=np.float64))
    peak = np.maximum.accumulate(np.concatenate([[1.0], wealth]))[1:]
    return np.asarray(wealth / peak - 1.0, dtype=np.float64)


def max_drawdown(returns: FloatArray) -> float:
    r = np.asarray(returns, dtype=np.float64)
    if r.size == 0:
        return float("nan")
    return float(drawdown_series(r).min())


def max_drawdown_episode(returns: pd.Series) -> dict[str, Any]:
    """Peak, trough and recovery dates of the deepest drawdown."""
    r = returns.to_numpy(dtype=np.float64)
    dd = drawdown_series(r)
    trough_i = int(np.argmin(dd))
    wealth = np.cumprod(1.0 + r)
    peak_i = int(np.argmax(wealth[: trough_i + 1])) if trough_i > 0 else 0
    if dd[trough_i] >= 0:
        return {"depth": 0.0, "peak": None, "trough": None, "recovery": None}
    peak_value = wealth[peak_i]
    after = np.nonzero(wealth[trough_i:] >= peak_value)[0]
    recovery = returns.index[trough_i + int(after[0])] if after.size else None
    return {
        "depth": float(dd[trough_i]),
        "peak": returns.index[peak_i],
        "trough": returns.index[trough_i],
        "recovery": recovery,
        "trading_days_to_trough": trough_i - peak_i,
        "trading_days_to_recover": (int(after[0]) if after.size else None),
    }


def calmar(returns: FloatArray) -> float:
    mdd = max_drawdown(returns)
    if not np.isfinite(mdd) or mdd >= 0:
        return float("nan")
    return float(cagr(returns) / abs(mdd))


def beta(asset: FloatArray, market: FloatArray) -> float:
    a = np.asarray(asset, dtype=np.float64)
    m = np.asarray(market, dtype=np.float64)
    if a.size < 3:
        return float("nan")
    var_m = float(np.var(m, ddof=1))
    if var_m == 0:
        return float("nan")
    return float(np.cov(a, m, ddof=1)[0, 1] / var_m)


def up_down_beta(asset: FloatArray, market: FloatArray, min_days: int = 20) -> tuple[float, float]:
    a = np.asarray(asset, dtype=np.float64)
    m = np.asarray(market, dtype=np.float64)
    up, down = m > 0, m < 0
    b_up = beta(a[up], m[up]) if up.sum() >= min_days else float("nan")
    b_down = beta(a[down], m[down]) if down.sum() >= min_days else float("nan")
    return b_up, b_down


def risk_contributions(weights: FloatArray, asset_returns: FloatArray) -> FloatArray:
    """Share of portfolio variance from each holding: w_i (Σw)_i / w'Σw. Sums to 1."""
    w = np.asarray(weights, dtype=np.float64)
    cov = np.cov(np.asarray(asset_returns, dtype=np.float64), rowvar=False, ddof=1)
    cov = np.atleast_2d(cov)
    marginal = cov @ w
    total = float(w @ marginal)
    if total <= 0:
        return np.full_like(w, np.nan)
    return np.asarray(w * marginal / total, dtype=np.float64)


def concentration(weights: FloatArray) -> dict[str, float]:
    w = np.sort(np.asarray(weights, dtype=np.float64))[::-1]
    hhi = float(np.sum(w**2))
    return {
        "top3_weight": float(w[:3].sum()),
        "herfindahl": hhi,
        "effective_holdings": 1.0 / hhi if hhi > 0 else float("nan"),
    }


def bootstrap_intervals(
    returns: FloatArray,
    rf: FloatArray,
    n_boot: int = 1000,
    block: int = 21,
    level: float = 0.90,
    seed: int = 7,
) -> dict[str, dict[str, float]]:
    """Block-bootstrap ranges for headline metrics.

    Resamples the historical daily returns in 21-day blocks and recomputes each
    metric, so the range reflects how much the figure depends on which days
    happened to occur. It does not capture regime changes outside the sample.
    """
    r = np.asarray(returns, dtype=np.float64)
    f = np.asarray(rf, dtype=np.float64)
    rng = np.random.default_rng(seed)
    idx = circular_block_indices(r.size, r.size, n_boot, block, rng)
    samples = r[idx]
    rf_s = f[idx]
    years = r.size / TRADING_DAYS

    growth = np.prod(1.0 + samples, axis=1)
    cagr_s = np.where(growth > 0, np.abs(growth) ** (1.0 / years) - 1.0, -1.0)
    vol_s = samples.std(axis=1, ddof=1) * np.sqrt(TRADING_DAYS)
    excess = samples - rf_s
    sd = excess.std(axis=1, ddof=1)
    sharpe_s = np.divide(
        excess.mean(axis=1) * np.sqrt(TRADING_DAYS),
        sd,
        out=np.full(n_boot, np.nan),
        where=sd > 0,
    )
    wealth = np.cumprod(1.0 + samples, axis=1)
    peak = np.maximum.accumulate(np.concatenate([np.ones((n_boot, 1)), wealth], axis=1), axis=1)
    mdd_s = (wealth / peak[:, 1:] - 1.0).min(axis=1)

    lo, hi = (1 - level) / 2 * 100, (1 + level) / 2 * 100

    def band(x: FloatArray) -> dict[str, float]:
        x = x[np.isfinite(x)]
        return {"low": float(np.percentile(x, lo)), "high": float(np.percentile(x, hi))}

    return {
        "level": {"low": lo / 100, "high": hi / 100},
        "cagr": band(cagr_s),
        "volatility": band(vol_s),
        "sharpe": band(sharpe_s),
        "max_drawdown": band(mdd_s),
    }


def summary(
    portfolio_returns: pd.Series,
    rf: pd.Series,
    weights: FloatArray,
    asset_returns: pd.DataFrame,
    benchmarks: pd.DataFrame,
    with_intervals: bool = True,
) -> dict[str, Any]:
    """Headline metrics for the Overview section.

    ``benchmarks`` holds daily returns of reference ETFs (SPY first) aligned
    to the portfolio's dates.
    """
    r = portfolio_returns.to_numpy(dtype=np.float64)
    f = rf.to_numpy(dtype=np.float64)
    out: dict[str, Any] = {
        "cagr": cagr(r),
        "volatility": annualized_vol(r),
        "sharpe": sharpe(r, f),
        "sortino": sortino(r, f),
        "calmar": calmar(r),
        "max_drawdown": max_drawdown_episode(portfolio_returns),
        "volatility_30d": annualized_vol(r[-30:]) if r.size >= 30 else None,
        "volatility_90d": annualized_vol(r[-90:]) if r.size >= 90 else None,
        "concentration": concentration(weights),
        "risk_contributions": dict(
            zip(
                asset_returns.columns,
                risk_contributions(weights, asset_returns.to_numpy()),
                strict=True,
            )
        ),
    }
    if "SPY" in benchmarks:
        m = benchmarks["SPY"].to_numpy(dtype=np.float64)
        b_up, b_down = up_down_beta(r, m)
        out["beta"] = beta(r, m)
        out["beta_up"] = b_up
        out["beta_down"] = b_down
    out["correlations"] = {
        name: float(np.corrcoef(r, benchmarks[name].to_numpy(dtype=np.float64))[0, 1])
        for name in benchmarks.columns
    }
    if with_intervals:
        out["intervals"] = bootstrap_intervals(r, f)
    return out
