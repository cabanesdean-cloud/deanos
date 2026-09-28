"""Factor exposures: Fama-French five factors plus momentum.

Regresses the portfolio's daily excess return (over the risk-free rate) on
Mkt-RF, SMB, HML, RMW, CMA and Mom from Kenneth French's data library.

Replaces the private model's regression on six ETFs (SPY, IWM, IVE, MTUM,
QUAL, QQQ). Those ETFs all hold large US stocks and move together, so their
coefficients were unstable and hard to interpret. The French factors are
long-short portfolios built to be close to independent.

Standard errors are Newey-West (HAC), which allow for autocorrelation and
changing volatility in daily returns. Variance inflation factors (VIF) show
whether the factors are too collinear in this sample to separate.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
import statsmodels.api as sm

TRADING_DAYS = 252
FACTORS = ("Mkt-RF", "SMB", "HML", "RMW", "CMA", "Mom")
DESCRIPTIONS = {
    "Mkt-RF": "Market: the stock market's return above cash",
    "SMB": "Size: small companies minus big companies",
    "HML": "Value: cheap (high book-to-market) minus expensive stocks",
    "RMW": "Profitability: robust minus weak operating profitability",
    "CMA": "Investment: conservative minus aggressive asset growth",
    "Mom": "Momentum: recent winners minus recent losers",
}
FloatArray = npt.NDArray[np.float64]


def newey_west_lags(n: int) -> int:
    """Rule-of-thumb lag length floor(4 (n/100)^(2/9)) (Newey and West, 1994)."""
    return int(np.floor(4 * (n / 100) ** (2 / 9)))


def vif(x: FloatArray) -> FloatArray:
    """Variance inflation factor per column: 1 / (1 − R²) from regressing it on the others."""
    x = np.asarray(x, dtype=np.float64)
    out = np.empty(x.shape[1])
    for j in range(x.shape[1]):
        y = x[:, j]
        others = np.column_stack([np.ones(len(x)), np.delete(x, j, axis=1)])
        coef, *_ = np.linalg.lstsq(others, y, rcond=None)
        resid = y - others @ coef
        r2 = 1 - resid.var() / y.var()
        out[j] = 1 / (1 - r2) if r2 < 1 else np.inf
    return out


def rolling_betas(y: FloatArray, x: FloatArray, window: int, step: int) -> FloatArray:
    rows = []
    for end in range(window, len(y) + 1, step):
        xs = np.column_stack([np.ones(window), x[end - window : end]])
        coef, *_ = np.linalg.lstsq(xs, y[end - window : end], rcond=None)
        rows.append(coef[1:])
    return np.asarray(rows, dtype=np.float64)


def analyze(portfolio_returns: pd.Series, factors: pd.DataFrame) -> dict[str, Any]:
    missing = [f for f in (*FACTORS, "RF") if f not in factors]
    if missing:
        raise ValueError(f"factor data missing columns: {missing}")
    df = factors[[*FACTORS, "RF"]].join(portfolio_returns.rename("p"), how="inner").dropna()
    if len(df) < 252:
        raise ValueError(
            "Less than one year of overlap between the portfolio and published factor data."
        )
    y = (df["p"] - df["RF"]).to_numpy(dtype=np.float64)
    x = df[list(FACTORS)].to_numpy(dtype=np.float64)
    lags = newey_west_lags(len(df))
    res = sm.OLS(y, sm.add_constant(x)).fit(cov_type="HAC", cov_kwds={"maxlags": lags})
    params = np.asarray(res.params)
    bse = np.asarray(res.bse)
    tvals = np.asarray(res.tvalues)
    pvals = np.asarray(res.pvalues)
    ci = np.asarray(res.conf_int(alpha=0.05))
    vifs = vif(x)
    means = x.mean(axis=0)

    loadings = {}
    for j, name in enumerate(FACTORS):
        k = j + 1
        loadings[name] = {
            "description": DESCRIPTIONS[name],
            "beta": float(params[k]),
            "std_error": float(bse[k]),
            "t_stat": float(tvals[k]),
            "p_value": float(pvals[k]),
            "ci95": [float(ci[k, 0]), float(ci[k, 1])],
            "vif": float(vifs[j]),
            "annual_return_contribution": float(params[k] * means[j] * TRADING_DAYS),
        }

    window, step = 252, 21
    rb = rolling_betas(y, x, window, step)
    ends = df.index[window - 1 :: step][: len(rb)]
    resid_vol = float(np.std(res.resid, ddof=len(params)) * np.sqrt(TRADING_DAYS))
    return {
        "window": {
            "start": str(df.index[0].date()),
            "end": str(df.index[-1].date()),
            "trading_days": len(df),
            "factor_data_end": str(factors.index[-1].date()),
        },
        "loadings": loadings,
        "alpha": {
            "annualized": float(params[0] * TRADING_DAYS),
            "ci95": [float(ci[0, 0] * TRADING_DAYS), float(ci[0, 1] * TRADING_DAYS)],
            "t_stat": float(tvals[0]),
            "p_value": float(pvals[0]),
        },
        "r_squared": float(res.rsquared),
        "adj_r_squared": float(res.rsquared_adj),
        "residual_vol": resid_vol,
        "newey_west_lags": lags,
        "max_vif": float(vifs.max()),
        "rolling": {
            "window_days": window,
            "dates": [str(d.date()) for d in ends],
            **{name: rb[:, j] for j, name in enumerate(FACTORS)},
        },
        "source": "Kenneth R. French Data Library (daily research factors)",
    }
