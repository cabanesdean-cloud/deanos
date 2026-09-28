"""Historical stress tests and custom shocks.

Historical scenarios replay what each holding actually did between a market
peak and trough, holding the starting weights (buy and hold, no rebalancing).
A holding that did not trade yet is stood in for by SPY scaled by the
holding's beta, estimated from its own later history, and labeled as such.

The private model scaled every holding by beta and a hand-set sector
multiplier and estimated recovery time as loss × 200 days. Both are dropped.

Custom shocks are linear: each holding moves by its estimated sensitivity to
SPY and to intermediate Treasuries (IEF) times the shock. The assumptions are
returned with the result.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import numpy as np
import numpy.typing as npt
import pandas as pd

MAX_FILL_DAYS = 5
BETA_WINDOW = 756
MIN_BETA_DAYS = 126
DEFAULT_IEF_DURATION = 7.5
FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    start: str
    end: str
    description: str


SCENARIOS = (
    Scenario(
        "dotcom",
        "Dot-com bust",
        "2000-03-24",
        "2002-10-09",
        "Technology valuations collapsed; the S&P 500 fell for two and a half years.",
    ),
    Scenario(
        "gfc",
        "Global financial crisis",
        "2007-10-09",
        "2009-03-09",
        "Housing and credit markets failed; banks needed government support.",
    ),
    Scenario(
        "euro_2011",
        "2011 debt-ceiling and euro crisis",
        "2011-04-29",
        "2011-10-03",
        "US credit downgrade and fears of a euro-area breakup.",
    ),
    Scenario(
        "q4_2018",
        "Q4 2018 sell-off",
        "2018-09-20",
        "2018-12-24",
        "Rate-hike and trade-war fears drove a sharp quarter-end decline.",
    ),
    Scenario(
        "covid",
        "COVID-19 crash",
        "2020-02-19",
        "2020-03-23",
        "The fastest 30% fall in S&P 500 history as the pandemic hit.",
    ),
    Scenario(
        "bear_2022",
        "2022 bear market",
        "2022-01-03",
        "2022-10-12",
        "Inflation and rapid rate hikes hit stocks and bonds at the same time.",
    ),
    Scenario(
        "tariff_2025",
        "2025 tariff shock",
        "2025-02-19",
        "2025-04-08",
        "Broad new US tariffs triggered a fast global sell-off.",
    ),
)


def _beta(asset: pd.Series, market: pd.Series) -> tuple[float, int]:
    j = pd.concat([asset, market], axis=1, join="inner").dropna().iloc[:BETA_WINDOW]
    if len(j) < MIN_BETA_DAYS:
        return float("nan"), len(j)
    a, m = j.iloc[:, 0].to_numpy(), j.iloc[:, 1].to_numpy()
    return float(np.cov(a, m, ddof=1)[0, 1] / np.var(m, ddof=1)), len(j)


def _path_stats(daily: FloatArray) -> tuple[float, float]:
    wealth = np.cumprod(1 + daily)
    peak = np.maximum.accumulate(np.concatenate([[1.0], wealth]))[1:]
    return float(wealth[-1] - 1), float((wealth / peak - 1).min())


def replay(
    prices: pd.DataFrame, spy: pd.Series, weights: FloatArray, scenario: Scenario
) -> dict[str, Any] | None:
    """Replay one scenario. ``prices`` holds full-history closes for the holdings."""
    start, end = pd.Timestamp(scenario.start), pd.Timestamp(scenario.end)
    spy_win = spy.loc[start:end].dropna()
    if len(spy_win) < 2:
        return None
    dates = spy_win.index
    spy_daily = np.asarray(spy_win.pct_change().iloc[1:], dtype=np.float64)
    spy_total, spy_mdd = _path_stats(spy_daily)
    spy_ret_all = spy.pct_change()

    growth = np.empty((len(dates) - 1, prices.shape[1]))
    assets: dict[str, Any] = {}
    for i, t in enumerate(prices.columns):
        series = prices[t]
        first = series.first_valid_index()
        win = series.reindex(dates).ffill(limit=MAX_FILL_DAYS)
        if first is not None and first <= dates[0] and win.notna().all():
            daily = np.asarray(win.pct_change().iloc[1:], dtype=np.float64)
            method, b = "replay", None
        else:
            b, n = _beta(series.pct_change(), spy_ret_all)
            if np.isfinite(b):
                method = "beta_scaled"
            else:
                method, b = "market_proxy", 1.0
            daily = b * spy_daily
        growth[:, i] = np.cumprod(1 + daily)
        total, mdd = _path_stats(daily)
        assets[t] = {
            "method": method,
            "beta_used": b,
            "listed": str(pd.Timestamp(cast(Any, first)).date()) if first is not None else None,
            "return": total,
            "max_drawdown": mdd,
            "contribution": float(weights[i] * total),
        }

    value = growth @ weights
    wealth = np.concatenate([[1.0], value])
    peak = np.maximum.accumulate(wealth)
    port_daily = wealth[1:] / wealth[:-1] - 1
    total = float(value[-1] - 1)
    return {
        "id": scenario.id,
        "name": scenario.name,
        "description": scenario.description,
        "start": str(dates[0].date()),
        "end": str(dates[-1].date()),
        "trading_days": len(dates) - 1,
        "portfolio": {
            "return": total,
            "max_drawdown": float((wealth / peak - 1).min()),
            "worst_day": float(port_daily.min()),
        },
        "spy": {"return": spy_total, "max_drawdown": spy_mdd},
        "path": {
            "dates": [str(d.date()) for d in dates],
            "portfolio": wealth,
            "spy": np.concatenate([[1.0], np.cumprod(1 + spy_daily)]),
        },
        "holdings": assets,
        "share_replayed": float(
            sum(w for w, a in zip(weights, assets.values(), strict=True) if a["method"] == "replay")
        ),
    }


def sensitivities(
    asset_returns: pd.DataFrame, spy_returns: pd.Series, ief_returns: pd.Series
) -> dict[str, dict[str, float]]:
    """OLS of each holding's daily return on SPY and IEF over the recent window."""
    df = asset_returns.join(
        pd.DataFrame({"__spy": spy_returns, "__ief": ief_returns}), how="inner"
    ).dropna()
    df = df.iloc[-BETA_WINDOW:]
    x = np.column_stack([np.ones(len(df)), df["__spy"], df["__ief"]])
    out = {}
    for t in asset_returns.columns:
        y = df[t].to_numpy()
        coef, *_ = np.linalg.lstsq(x, y, rcond=None)
        resid = y - x @ coef
        out[t] = {
            "beta_market": float(coef[1]),
            "beta_treasury": float(coef[2]),
            "r_squared": float(1 - resid.var() / y.var()) if y.var() > 0 else 0.0,
        }
    return out


def custom_shock(
    sens: dict[str, dict[str, float]],
    weights: FloatArray,
    market_move: float,
    rate_change_bps: float,
    ief_duration: float = DEFAULT_IEF_DURATION,
) -> dict[str, Any]:
    ief_move = -ief_duration * rate_change_bps / 10_000
    holdings = {}
    total = 0.0
    for w, (t, s) in zip(weights, sens.items(), strict=True):
        move = max(-1.0, s["beta_market"] * market_move + s["beta_treasury"] * ief_move)
        holdings[t] = {**s, "move": move, "contribution": float(w * move)}
        total += w * move
    return {
        "inputs": {"market_move": market_move, "rate_change_bps": rate_change_bps},
        "portfolio_move": float(total),
        "holdings": holdings,
        "assumptions": {
            "treasury_proxy": "IEF (7-10 year US Treasuries)",
            "ief_duration_years": ief_duration,
            "implied_ief_move": ief_move,
            "sensitivity_window_days": BETA_WINDOW,
            "notes": [
                "Moves are instantaneous and linear in each holding's estimated sensitivities.",
                "Rates move IEF by duration x change in yield; convexity is ignored.",
                "Company-specific moves, correlation breakdowns and liquidity are not modeled.",
            ],
        },
    }


def analyze(
    prices: pd.DataFrame,
    spy: pd.Series,
    ief: pd.Series,
    weights: FloatArray,
    asset_returns: pd.DataFrame,
    market_move: float = -0.20,
    rate_change_bps: float = 100.0,
) -> dict[str, Any]:
    scenarios = [s for sc in SCENARIOS if (s := replay(prices, spy, weights, sc)) is not None]
    sens = sensitivities(asset_returns, spy.pct_change(), ief.pct_change())
    worst = min(scenarios, key=lambda s: s["portfolio"]["return"]) if scenarios else None
    return {
        "scenarios": scenarios,
        "worst": {"id": worst["id"], "return": worst["portfolio"]["return"]} if worst else None,
        "custom": custom_shock(sens, weights, market_move, rate_change_bps),
        "sensitivities": sens,
    }
