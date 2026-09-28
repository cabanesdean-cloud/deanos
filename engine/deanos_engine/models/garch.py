"""GARCH(1,1) volatility model with an EWMA fallback.

Changes from the private model:

- The "21-day forecast" is the average volatility over the next 21 trading
  days (square root of the mean forecast variance), not the day-21 value.
  The per-day term structure is returned too.
- Residual diagnostics: Ljung-Box tests on standardized residuals and on their
  squares. Remaining autocorrelation in squared residuals means the model has
  not captured the volatility clustering.
- The EWMA fallback forecast is flat, as RiskMetrics EWMA implies. The private
  version blended toward long-run volatility, which EWMA has no basis for.

Kept: the fallback to EWMA (λ = 0.94) when the fit fails or is degenerate
(α ≈ 0 with β ≈ 1, the optimizer sitting on its boundary).
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
import pandas as pd
from statsmodels.stats.diagnostic import acorr_ljungbox

TRADING_DAYS = 252
EWMA_LAMBDA = 0.94
SCALE = 100.0  # arch fits better on percent returns
FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True)
class VolModel:
    method: Literal["garch", "ewma"]
    omega: float
    """Daily variance intercept in decimal units (0 for EWMA)."""
    alpha: float
    beta: float
    mu: float
    """Daily mean in decimal units."""
    conditional_vol: pd.Series
    """In-sample daily conditional volatility σ_t (decimal)."""
    next_variance: float
    """One-step-ahead daily variance σ²_{T+1} (decimal)."""
    std_resid: FloatArray
    """Standardized residuals z_t = (r_t - μ) / σ_t."""
    fallback_reason: str | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)

    @property
    def persistence(self) -> float:
        return self.alpha + self.beta

    @property
    def long_run_variance(self) -> float:
        if self.method == "ewma" or self.persistence >= 1:
            return float("nan")
        return self.omega / (1.0 - self.persistence)

    def variance_path(self, horizon: int) -> FloatArray:
        """Daily variance forecasts σ²_{T+1..T+h}.

        GARCH(1,1): σ²_{T+k} = V_L + (α+β)^(k-1) (σ²_{T+1} − V_L).
        EWMA: flat at σ²_{T+1}.
        """
        k = np.arange(horizon, dtype=np.float64)
        if self.method == "ewma" or not np.isfinite(self.long_run_variance):
            return np.full(horizon, self.next_variance)
        vl = self.long_run_variance
        return np.asarray(vl + self.persistence**k * (self.next_variance - vl), dtype=np.float64)

    def average_vol(self, horizon: int) -> float:
        """Annualized average volatility over the next ``horizon`` days."""
        return float(np.sqrt(self.variance_path(horizon).mean() * TRADING_DAYS))

    def point_vol(self, day: int) -> float:
        """Annualized volatility forecast for a single day ``day`` ahead."""
        return float(np.sqrt(self.variance_path(day)[-1] * TRADING_DAYS))


def ewma(returns: pd.Series, reason: str, lam: float = EWMA_LAMBDA) -> VolModel:
    r = returns.to_numpy(dtype=np.float64)
    mu = 0.0
    var = np.empty(r.size)
    seed_n = min(30, r.size)
    var[0] = float(np.mean(r[:seed_n] ** 2))
    for t in range(1, r.size):
        var[t] = lam * var[t - 1] + (1 - lam) * r[t - 1] ** 2
    nxt = lam * var[-1] + (1 - lam) * r[-1] ** 2
    sigma = np.sqrt(var)
    z = (r - mu) / sigma
    return VolModel(
        method="ewma",
        omega=0.0,
        alpha=1 - lam,
        beta=lam,
        mu=mu,
        conditional_vol=pd.Series(sigma, index=returns.index),
        next_variance=float(nxt),
        std_resid=np.asarray(z, dtype=np.float64),
        fallback_reason=reason,
        diagnostics=ljung_box(z),
    )


def ljung_box(z: FloatArray, lags: int = 10) -> dict[str, Any]:
    z = np.asarray(z, dtype=np.float64)
    z = z[np.isfinite(z)]
    if z.size <= lags + 5:
        return {}
    lb = acorr_ljungbox(z, lags=[lags], return_df=True)
    lb2 = acorr_ljungbox(z**2, lags=[lags], return_df=True)
    return {
        "lags": lags,
        "residuals": {
            "stat": float(lb["lb_stat"].iloc[0]),
            "p_value": float(lb["lb_pvalue"].iloc[0]),
        },
        "squared_residuals": {
            "stat": float(lb2["lb_stat"].iloc[0]),
            "p_value": float(lb2["lb_pvalue"].iloc[0]),
        },
    }


def fit(returns: pd.Series) -> VolModel:
    """Fit GARCH(1,1) with normal quasi-likelihood; fall back to EWMA if unusable."""
    from arch import arch_model

    r = returns.dropna()
    if len(r) < 250:
        return ewma(r, "fewer than 250 observations")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = arch_model(r * SCALE, mean="Constant", vol="GARCH", p=1, q=1, rescale=False).fit(
                disp="off", show_warning=False
            )
    except Exception as exc:  # numerical failure inside the optimizer
        return ewma(r, f"fit failed ({type(exc).__name__})")

    params = res.params
    alpha = float(params.get("alpha[1]", np.nan))
    beta = float(params.get("beta[1]", np.nan))
    omega = float(params.get("omega", np.nan)) / SCALE**2
    mu = float(params.get("mu", 0.0)) / SCALE

    if res.convergence_flag != 0 or not np.isfinite([alpha, beta, omega]).all():
        return ewma(r, "optimizer did not converge")
    if alpha < 0.001 and beta > 0.99:
        return ewma(r, "degenerate fit (alpha near 0, beta near 1)")
    if alpha + beta >= 1:
        return ewma(r, "non-stationary fit (alpha + beta >= 1)")

    sigma = np.asarray(res.conditional_volatility, dtype=np.float64) / SCALE
    last_resid = float(r.iloc[-1] - mu)
    nxt = omega + alpha * last_resid**2 + beta * sigma[-1] ** 2
    z = (r.to_numpy(dtype=np.float64) - mu) / sigma
    return VolModel(
        method="garch",
        omega=omega,
        alpha=alpha,
        beta=beta,
        mu=mu,
        conditional_vol=pd.Series(sigma, index=r.index),
        next_variance=float(nxt),
        std_resid=np.asarray(z, dtype=np.float64),
        diagnostics=ljung_box(z),
    )


def rolling_vol(returns: pd.Series, window: int = 21) -> pd.Series:
    out: pd.Series = returns.rolling(window).std(ddof=1).dropna() * np.sqrt(TRADING_DAYS)
    return out


def classify(ratio: float) -> str:
    if ratio < 0.8:
        return "low"
    if ratio < 1.3:
        return "normal"
    if ratio < 1.8:
        return "elevated"
    return "high"


def analyze(
    portfolio_returns: pd.Series,
    asset_returns: pd.DataFrame,
    weights: FloatArray,
    history_days: int = 756,
) -> dict[str, Any]:
    """Volatility section: portfolio model, forecasts, diagnostics and per-holding view."""
    model = fit(portfolio_returns)
    horizons = [1, 5, 21, 63]
    term = [
        {"day": d, "point": model.point_vol(d), "average": model.average_vol(d)}
        for d in range(1, 64)
    ]
    realized = rolling_vol(portfolio_returns)
    cond = model.conditional_vol * np.sqrt(TRADING_DAYS)
    hist = pd.DataFrame({"realized_21d": realized, "model": cond}).dropna().iloc[-history_days:]
    current = float(np.sqrt(model.next_variance * TRADING_DAYS))
    full_realized = realized.to_numpy()

    holdings: dict[str, Any] = {}
    order = np.argsort(-np.asarray(weights))
    for i in order:
        t = asset_returns.columns[i]
        m = fit(asset_returns[t])
        long_run = float(asset_returns[t].std(ddof=1) * np.sqrt(TRADING_DAYS))
        cur = float(np.sqrt(m.next_variance * TRADING_DAYS))
        holdings[t] = {
            "weight": float(weights[i]),
            "method": m.method,
            "current": cur,
            "average_21d": m.average_vol(21),
            "sample_vol": long_run,
            "ratio_to_sample": cur / long_run if long_run > 0 else None,
            "level": classify(cur / long_run) if long_run > 0 else None,
            "persistence": m.persistence,
        }

    long_run_model = (
        float(np.sqrt(model.long_run_variance * TRADING_DAYS))
        if np.isfinite(model.long_run_variance)
        else None
    )
    half_life = (
        float(np.log(0.5) / np.log(model.persistence))
        if model.method == "garch" and 0 < model.persistence < 1
        else None
    )
    return {
        "method": model.method,
        "fallback_reason": model.fallback_reason,
        "current": current,
        "percentile_vs_history": float((full_realized < current).mean()),
        "sample_vol": float(portfolio_returns.std(ddof=1) * np.sqrt(TRADING_DAYS)),
        "long_run_model": long_run_model,
        "forecasts": {f"average_{h}d": model.average_vol(h) for h in horizons},
        "term_structure": term,
        "parameters": {
            "omega": model.omega,
            "alpha": model.alpha,
            "beta": model.beta,
            "persistence": model.persistence,
            "half_life_days": half_life,
        },
        "diagnostics": model.diagnostics,
        "history": {
            "dates": [str(d.date()) for d in hist.index],
            "realized_21d": hist["realized_21d"].to_numpy(),
            "model": hist["model"].to_numpy(),
        },
        "holdings": holdings,
    }
