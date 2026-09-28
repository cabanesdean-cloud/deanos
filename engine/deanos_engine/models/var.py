"""One-day Value at Risk and Expected Shortfall, with backtests.

Three methods:

- Historical simulation: the empirical quantile of past daily returns.
- Parametric (normal): volatility times the normal quantile, zero mean.
- Filtered historical simulation (FHS): GARCH-standardized residuals rescaled
  by tomorrow's forecast volatility. It keeps the empirical shape of the
  residuals (fat tails, skew) while reacting to current volatility.

The private model's third method drew from a normal distribution with the
sample mean and volatility, which reproduces the parametric figure with
simulation noise. FHS replaces it.

The backtest re-estimates each method using only data available before each
day, then counts breaches and runs the Kupiec proportion-of-failures and
Christoffersen independence tests.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy import stats
from scipy.special import xlogy

from deanos_engine.models import garch

LEVELS = (0.95, 0.99)
FloatArray = npt.NDArray[np.float64]


# ─── Point estimates ────────────────────────────────────────────────────────────


def historical(returns: FloatArray, level: float) -> tuple[float, float]:
    """(VaR, ES) as positive loss fractions from the empirical distribution."""
    r = np.asarray(returns, dtype=np.float64)
    q = float(np.quantile(r, 1 - level))
    tail = r[r <= q]
    return -q, -float(tail.mean()) if tail.size else -q


def parametric(returns: FloatArray, level: float) -> tuple[float, float]:
    """(VaR, ES) under a zero-mean normal distribution."""
    sd = float(np.std(np.asarray(returns, dtype=np.float64), ddof=1))
    z = float(stats.norm.ppf(1 - level))
    es = sd * float(stats.norm.pdf(z)) / (1 - level)
    return -sd * z, es


def filtered_historical(model: garch.VolModel, level: float) -> tuple[float, float]:
    """(VaR, ES) from standardized residuals scaled by next-day volatility."""
    z = model.std_resid[np.isfinite(model.std_resid)]
    q = float(np.quantile(z, 1 - level))
    tail = z[z <= q]
    sigma = float(np.sqrt(model.next_variance))
    var = -(model.mu + sigma * q)
    es = -(model.mu + sigma * float(tail.mean())) if tail.size else var
    return var, es


def component_var(weights: FloatArray, asset_returns: FloatArray, level: float) -> FloatArray:
    """Euler allocation of parametric VaR: w_i (Σw)_i / σ_p × |z|. Sums to total VaR."""
    w = np.asarray(weights, dtype=np.float64)
    cov = np.atleast_2d(np.cov(np.asarray(asset_returns, dtype=np.float64), rowvar=False))
    sigma_p = float(np.sqrt(w @ cov @ w))
    z = -float(stats.norm.ppf(1 - level))
    return np.asarray(w * (cov @ w) / sigma_p * z, dtype=np.float64)


# ─── Backtest statistics ────────────────────────────────────────────────────────


def kupiec_pof(breaches: int, n: int, level: float) -> dict[str, float]:
    """Kupiec (1995) proportion-of-failures likelihood ratio, χ²(1) under H0."""
    p = 1 - level
    x = breaches
    phat = x / n
    ll0 = xlogy(n - x, 1 - p) + xlogy(x, p)
    ll1 = xlogy(n - x, 1 - phat) + xlogy(x, phat)
    lr = float(-2 * (ll0 - ll1))
    return {"lr": lr, "p_value": float(stats.chi2.sf(lr, 1))}


def christoffersen_independence(hits: npt.NDArray[np.bool_]) -> dict[str, float]:
    """Christoffersen (1998) independence test: do breaches cluster? χ²(1) under H0."""
    h = np.asarray(hits, dtype=bool)
    prev, cur = h[:-1], h[1:]
    n00 = int(np.sum(~prev & ~cur))
    n01 = int(np.sum(~prev & cur))
    n10 = int(np.sum(prev & ~cur))
    n11 = int(np.sum(prev & cur))
    if n01 + n11 == 0 or n00 + n10 == 0:
        return {"lr": 0.0, "p_value": 1.0}
    pi = (n01 + n11) / (n00 + n01 + n10 + n11)
    pi01 = n01 / (n00 + n01) if n00 + n01 else 0.0
    pi11 = n11 / (n10 + n11) if n10 + n11 else 0.0
    ll0 = xlogy(n00 + n10, 1 - pi) + xlogy(n01 + n11, pi)
    ll1 = xlogy(n00, 1 - pi01) + xlogy(n01, pi01) + xlogy(n10, 1 - pi11) + xlogy(n11, pi11)
    lr = float(max(0.0, -2 * (ll0 - ll1)))
    return {"lr": lr, "p_value": float(stats.chi2.sf(lr, 1))}


def evaluate(returns: FloatArray, var_forecasts: FloatArray, level: float) -> dict[str, Any]:
    r = np.asarray(returns, dtype=np.float64)
    v = np.asarray(var_forecasts, dtype=np.float64)
    hits = r < -v
    n, x = int(r.size), int(hits.sum())
    pof = kupiec_pof(x, n, level)
    ind = christoffersen_independence(hits)
    cc_lr = pof["lr"] + ind["lr"]
    return {
        "days": n,
        "breaches": x,
        "expected": n * (1 - level),
        "breach_rate": x / n,
        "kupiec": pof,
        "christoffersen": ind,
        "conditional_coverage": {"lr": cc_lr, "p_value": float(stats.chi2.sf(cc_lr, 2))},
        "passes_5pct": bool(pof["p_value"] > 0.05 and ind["p_value"] > 0.05),
    }


# ─── Rolling forecasts ──────────────────────────────────────────────────────────


def rolling_forecasts(
    returns: pd.Series,
    test_days: int,
    window: int = 500,
    garch_window: int = 1000,
    refit_every: int = 21,
) -> dict[str, dict[float, FloatArray]]:
    """Out-of-sample VaR for each of the last ``test_days`` days.

    Each forecast uses only returns before that day. Historical and parametric
    use a trailing ``window``. FHS refits GARCH every ``refit_every`` days on a
    trailing ``garch_window`` and updates the variance daily in between.
    """
    r = returns.to_numpy(dtype=np.float64)
    n = r.size
    start = n - test_days
    out: dict[str, dict[float, FloatArray]] = {
        m: {lv: np.empty(test_days) for lv in LEVELS}
        for m in ("historical", "parametric", "filtered_historical")
    }
    zq = {lv: float(stats.norm.ppf(1 - lv)) for lv in LEVELS}
    for j, i in enumerate(range(start, n)):
        past = r[i - window : i]
        sd = float(np.std(past, ddof=1))
        for lv in LEVELS:
            out["historical"][lv][j] = -float(np.quantile(past, 1 - lv))
            out["parametric"][lv][j] = -sd * zq[lv]

    i = start
    while i < n:
        model = garch.fit(returns.iloc[max(0, i - garch_window) : i])
        z = model.std_resid[np.isfinite(model.std_resid)]
        q = {lv: float(np.quantile(z, 1 - lv)) for lv in LEVELS}
        var_next = model.next_variance
        for k in range(i, min(i + refit_every, n)):
            sigma = np.sqrt(var_next)
            for lv in LEVELS:
                out["filtered_historical"][lv][k - start] = -(model.mu + sigma * q[lv])
            e = r[k] - model.mu
            var_next = model.omega + model.alpha * e * e + model.beta * var_next
        i += refit_every
    return out


# ─── Section output ─────────────────────────────────────────────────────────────


def analyze(
    portfolio_returns: pd.Series,
    asset_returns: pd.DataFrame,
    weights: FloatArray,
    backtest_days: int = 750,
    backtest_window: int = 500,
) -> dict[str, Any]:
    r = portfolio_returns.to_numpy(dtype=np.float64)
    model = garch.fit(portfolio_returns)

    estimates: dict[str, Any] = {}
    for lv in LEVELS:
        key = f"{round(lv * 100)}"
        h_var, h_es = historical(r, lv)
        p_var, p_es = parametric(r, lv)
        f_var, f_es = filtered_historical(model, lv)
        estimates[key] = {
            "historical": {"var": h_var, "es": h_es},
            "parametric": {"var": p_var, "es": p_es},
            "filtered_historical": {"var": f_var, "es": f_es},
        }

    comp = component_var(weights, asset_returns.to_numpy(), 0.95)
    total = float(comp.sum())
    contributions = {
        t: {"var": float(c), "share": float(c / total) if total else None}
        for t, c in zip(asset_returns.columns, comp, strict=True)
    }

    test_days = min(backtest_days, len(r) - backtest_window)
    backtest: dict[str, Any] | None = None
    if test_days >= 250:
        fc = rolling_forecasts(portfolio_returns, test_days, window=backtest_window)
        realized = r[-test_days:]
        backtest = {
            "start": str(portfolio_returns.index[-test_days].date()),
            "end": str(portfolio_returns.index[-1].date()),
            "estimation_window_days": backtest_window,
            "garch_window_days": 1000,
            "garch_refit_every_days": 21,
            "results": {
                method: {
                    f"{round(lv * 100)}": evaluate(realized, fc[method][lv], lv) for lv in LEVELS
                }
                for method in fc
            },
            "series_95": {
                "dates": [str(d.date()) for d in portfolio_returns.index[-test_days:]],
                "returns": realized,
                **{method: fc[method][0.95] for method in fc},
            },
        }

    losses = -r * 100
    bands = [0, 1, 2, 3, 4, 5, 7, 10, np.inf]
    down = losses[losses > 0]
    counts, _ = np.histogram(down, bins=bands)
    return {
        "horizon_days": 1,
        "estimates": estimates,
        "volatility_model": model.method,
        "contributions_95": contributions,
        "backtest": backtest,
        "loss_histogram": {
            "bands_pct": [[bands[i], bands[i + 1]] for i in range(len(bands) - 1)],
            "counts": counts,
            "down_days": int(down.size),
            "total_days": int(r.size),
        },
    }
