"""Nonlinear Beta Tracker: how an asset's sensitivity to a benchmark changes with its move.

Port of Dean's original Nonlinear Beta Tracker (a standalone FastAPI + React
app, his first project). Its definition is kept:

1. Linear OLS: r_a = a + b * r_m + e.
2. Quadratic: r_a = a + b1 * r_m + b2 * r_m**2 + e. The fitted relationship is
   a curve; its slope b1 + 2 * b2 * r_m (the original's "effective beta") is the
   local sensitivity at a benchmark return r_m. b2 itself is a curvature
   coefficient, not a beta.
3. Benchmark-quantile betas: a separate linear OLS within six buckets of the
   benchmark return (below the 10th percentile, 10-25, 25-50, 50-75, 75-90,
   above the 90th). These are conditional estimates.
4. Volatility-regime betas: linear OLS on periods when the benchmark's trailing
   21-period volatility is below, or at or above, its median.
5. Rolling linear beta and quadratic b1 over a trailing window (default 60).

Original defaults: daily log returns, five-year lookback, no risk-free
adjustment, no winsorizing, 60-period rolling window. Changes, all disclosed on
the methodology page:

- Returns are only formed between consecutive dates on which both prices exist.
  The original dropped missing closes per series before differencing, so a gap
  in one series produced a multi-day return that was paired with a one-day
  benchmark return.
- Standard errors and intervals are heteroskedasticity-robust (HC1). The
  original reported classical OLS errors, which daily returns' changing
  volatility makes too narrow; classical errors are still returned.
- The volatility regime uses trailing volatility through the previous period.
  The original's window included the current return, which sorted large-move
  days into the high-volatility group by construction.
- The sensitivity curve is drawn over the observed benchmark range (0.5th to
  99.5th percentile) with a delta-method band, instead of a fixed +/-5%.
- Sparse buckets are flagged instead of reported like well-populated ones.

Pure functions: prices in, dictionaries out. No I/O.
"""

from __future__ import annotations

from typing import Any, Literal

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy import stats

FloatArray = npt.NDArray[np.float64]
Frequency = Literal["daily", "weekly", "monthly"]
ReturnType = Literal["log", "simple"]

LOOKBACK_YEARS: dict[str, float | None] = {
    "6M": 0.5,
    "1Y": 1.0,
    "3Y": 3.0,
    "5Y": 5.0,
    "10Y": 10.0,
    "max": None,
}
PERIODS_PER_YEAR = {"daily": 252, "weekly": 52, "monthly": 12}
PERIOD_WORD = {"daily": "day", "weekly": "week", "monthly": "month"}

# (label, original label, lower quantile, upper quantile); the last bucket includes its upper edge.
QUANTILE_BUCKETS: list[tuple[str, str, float, float]] = [
    ("Bottom 10%", "Bear (<10%)", 0.00, 0.10),
    ("10th to 25th", "Down (10-25%)", 0.10, 0.25),
    ("25th to 50th", "Mild Down (25-50%)", 0.25, 0.50),
    ("50th to 75th", "Mild Up (50-75%)", 0.50, 0.75),
    ("75th to 90th", "Up (75-90%)", 0.75, 0.90),
    ("Top 10%", "Bull (>90%)", 0.90, 1.00),
]
# Original: sensitivity reported at these benchmark moves.
SENSITIVITY_LEVELS = [-0.03, -0.02, -0.01, 0.0, 0.01, 0.02, 0.03]
VOL_WINDOW = 21
MIN_OBS = 30  # original: at least max(30, rolling_window + 10) aligned observations
MIN_BUCKET_OBS = 5  # original: with fewer observations the bucket beta is not estimated
SPARSE_BUCKET_OBS = 30  # new: estimated, but flagged as imprecise
MIN_VOL_REGIME_OBS = 10  # original
MIN_BENCH_STD = 1e-6  # per-period standard deviation below which there is nothing to regress on
MAX_SERIES_POINTS = 600
Z95 = 1.959963984540054


class BetaError(ValueError):
    """The request cannot be analysed (too little data, flat benchmark). Message is user-facing."""


# ─── Data preparation ─────────────────────────────────────────────────────────


def period_returns(
    asset: pd.Series,
    benchmark: pd.Series,
    frequency: Frequency = "daily",
    return_type: ReturnType = "log",
    lookback: str = "5Y",
) -> tuple[pd.DatetimeIndex, FloatArray, FloatArray, dict[str, Any]]:
    """Aligned asset and benchmark returns over the lookback window.

    Prices are adjusted closes on a shared date index (NaN where a ticker did
    not trade or was not listed). Nothing is forward-filled: a daily return is
    kept only when both tickers have a price on that date and on the previous
    date in the index. Weekly (Friday) and monthly (month-end) returns use each
    period's last date on which both tickers have prices; a period with no
    shared price drops the returns on both sides of it.
    """
    if frequency not in PERIODS_PER_YEAR:
        raise BetaError("Frequency must be daily, weekly or monthly.")
    if return_type not in ("log", "simple"):
        raise BetaError("Return type must be log or simple.")
    if lookback not in LOOKBACK_YEARS:
        raise BetaError("Lookback must be one of " + ", ".join(LOOKBACK_YEARS) + ".")

    df = pd.DataFrame({"a": asset, "b": benchmark}).sort_index()
    df = df.where(df > 0)  # a non-positive adjusted close is unusable
    both = df.notna().all(axis=1)
    if not both.any():
        raise BetaError("The asset and the benchmark have no dates in common.")
    joint_dates = df.index[both.to_numpy()]
    end = joint_dates[-1]
    first_joint = joint_dates[0]
    years = LOOKBACK_YEARS[lookback]
    requested_start = (
        end - pd.Timedelta(days=round(years * 365.25)) if years is not None else df.index[0]
    )
    window = df.loc[max(requested_start, df.index[0]) :]
    wboth = window.notna().all(axis=1)

    if frequency == "daily":
        prev = wboth.shift(1, fill_value=False)
        valid = (wboth & prev).to_numpy()
        ratio = (window / window.shift(1)).to_numpy()[valid]
        dates = window.index[valid]
        # dates with both prices whose previous row lacks one: a return that would span a gap
        gaps = max(0, int((wboth & ~prev).sum()) - 1)
    else:
        rule = "W-FRI" if frequency == "weekly" else "ME"
        closes = window[wboth].resample(rule).last()
        r = closes / closes.shift(1)
        keep = r.notna().all(axis=1).to_numpy()
        gaps = int(closes.isna().any(axis=1).sum())
        ratio = r.to_numpy()[keep]
        dates = r.index[keep]

    ratio = np.asarray(ratio, dtype=np.float64).reshape(-1, 2)
    rets = np.log(ratio) if return_type == "log" else ratio - 1.0
    ra = np.ascontiguousarray(rets[:, 0])
    rb = np.ascontiguousarray(rets[:, 1])
    info: dict[str, Any] = {
        "start": str(dates[0].date()) if len(dates) else None,
        "end": str(dates[-1].date()) if len(dates) else None,
        "observations": int(ra.size),
        "frequency": frequency,
        "return_type": return_type,
        "lookback": lookback,
        "requested_start": str(pd.Timestamp(requested_start).date()),
        "shared_history_start": str(first_joint.date()),
        "limited_by_history": bool(first_joint > requested_start),
        "skipped_gaps": gaps,
        "forward_filled": 0,
    }
    return pd.DatetimeIndex(dates), ra, rb, info


def winsorize(x: FloatArray, pct: float = 0.01) -> FloatArray:
    """Clip at the pct and 1 - pct quantiles (original: 1% and 99%, each series separately)."""
    lo, hi = np.percentile(x, [pct * 100, (1 - pct) * 100])
    return np.asarray(np.clip(x, lo, hi), dtype=np.float64)


# ─── Regression ───────────────────────────────────────────────────────────────


def ols(y: FloatArray, X: FloatArray) -> dict[str, Any]:
    """OLS with classical and HC1 (White, small-sample scaled) standard errors.

    X must include the intercept column. Returns {"ok": False} when the design
    is rank-deficient or has no residual degrees of freedom.
    """
    y = np.asarray(y, dtype=np.float64)
    X = np.asarray(X, dtype=np.float64)
    n, k = X.shape
    if n <= k or np.linalg.matrix_rank(X) < k:
        return {"ok": False, "n": n}
    xtx_inv = np.linalg.inv(X.T @ X)
    coef = xtx_inv @ (X.T @ y)
    resid = y - X @ coef
    df = n - k
    rss = float(resid @ resid)
    tss = float(((y - y.mean()) ** 2).sum())
    cov = xtx_inv * (rss / df)
    meat = (X * (resid**2)[:, None]).T @ X
    cov_hc1 = xtx_inv @ meat @ xtx_inv * (n / df)
    se = np.sqrt(np.clip(np.diag(cov), 0, None))
    se_r = np.sqrt(np.clip(np.diag(cov_hc1), 0, None))
    with np.errstate(divide="ignore", invalid="ignore"):
        t_r = np.where(se_r > 0, coef / se_r, np.nan)
        t_c = np.where(se > 0, coef / se, np.nan)
    p_r = 2 * stats.t.sf(np.abs(t_r), df)
    p_c = 2 * stats.t.sf(np.abs(t_c), df)
    return {
        "ok": True,
        "n": n,
        "coef": coef,
        "se": se,
        "se_robust": se_r,
        "t_robust": t_r,
        "p_robust": p_r,
        "p_classical": p_c,
        "cov_robust": cov_hc1,
        "r_squared": 1.0 - rss / tss if tss > 0 else float("nan"),
    }


def _design(x: FloatArray, quadratic: bool = False) -> FloatArray:
    cols = [np.ones_like(x), x] + ([x * x] if quadratic else [])
    return np.column_stack(cols)


def _slope_block(fit: dict[str, Any], i: int = 1) -> dict[str, Any]:
    b = float(fit["coef"][i])
    se = float(fit["se_robust"][i])
    return {
        "estimate": b,
        "se": se,
        "se_classical": float(fit["se"][i]),
        "ci_low": b - Z95 * se,
        "ci_high": b + Z95 * se,
        "p_value": float(fit["p_robust"][i]),
    }


def sensitivity(fit: dict[str, Any], x: FloatArray | float) -> tuple[FloatArray, FloatArray]:
    """Local slope b1 + 2 b2 x of a quadratic fit and its delta-method (HC1) standard error."""
    xs = np.asarray(x, dtype=np.float64)
    b1, b2 = float(fit["coef"][1]), float(fit["coef"][2])
    v = fit["cov_robust"]
    s = b1 + 2 * b2 * xs
    var = v[1, 1] + 4 * xs * v[1, 2] + 4 * xs * xs * v[2, 2]
    return np.asarray(s, dtype=np.float64), np.sqrt(np.clip(var, 0, None))


def _flat(x: FloatArray) -> bool:
    return x.size < 2 or float(np.std(x, ddof=1)) < MIN_BENCH_STD


# ─── Pieces of the analysis ───────────────────────────────────────────────────


def quantile_buckets(ra: FloatArray, rb: FloatArray) -> list[dict[str, Any]]:
    """Original bucket betas: linear OLS within percentile bands of the benchmark return."""
    out: list[dict[str, Any]] = []
    for label, original, lo_q, hi_q in QUANTILE_BUCKETS:
        lo = float(np.percentile(rb, lo_q * 100))
        hi = float(np.percentile(rb, hi_q * 100))
        mask = rb >= lo if hi_q >= 1.0 else (rb >= lo) & (rb < hi)
        idx = np.flatnonzero(mask)
        row: dict[str, Any] = {
            "label": label,
            "original_label": original,
            "quantiles": [lo_q, hi_q],
            "n": int(idx.size),
            "benchmark_low": float(rb[idx].min()) if idx.size else None,
            "benchmark_high": float(rb[idx].max()) if idx.size else None,
            "benchmark_mean": float(rb[idx].mean()) if idx.size else None,
            "beta": None,
            "sparse": bool(idx.size < SPARSE_BUCKET_OBS),
        }
        if idx.size >= MIN_BUCKET_OBS and not _flat(rb[idx]):
            fit = ols(ra[idx], _design(rb[idx]))
            if fit["ok"]:
                row["beta"] = _slope_block(fit)
                row["alpha"] = float(fit["coef"][0])
                row["r_squared"] = float(fit["r_squared"])
        out.append(row)
    return out


def trailing_vol(rb: FloatArray, window: int = VOL_WINDOW) -> FloatArray:
    """Standard deviation of the window returns before each period (NaN until available)."""
    s = pd.Series(rb).rolling(window).std(ddof=1).shift(1)
    return np.asarray(s.to_numpy(), dtype=np.float64)


def vol_regimes(ra: FloatArray, rb: FloatArray, window: int = VOL_WINDOW) -> dict[str, Any]:
    """Linear beta when trailing benchmark volatility is below vs at or above its median."""
    vol = trailing_vol(rb, window)
    ok = np.isfinite(vol)
    if ok.sum() < 2 * MIN_VOL_REGIME_OBS:
        return {"median_vol": None, "window": window, "regimes": []}
    median = float(np.median(vol[ok]))
    rows = []
    groups = (("Calmer periods", ok & (vol < median)), ("Turbulent periods", ok & (vol >= median)))
    for label, mask in groups:
        idx = np.flatnonzero(mask)
        row: dict[str, Any] = {"label": label, "n": int(idx.size), "beta": None}
        if idx.size >= MIN_VOL_REGIME_OBS and not _flat(rb[idx]):
            fit = ols(ra[idx], _design(rb[idx]))
            if fit["ok"]:
                row["beta"] = _slope_block(fit)
        rows.append(row)
    return {"median_vol": median, "window": window, "regimes": rows}


def rolling_betas(ra: FloatArray, rb: FloatArray, window: int) -> tuple[FloatArray, FloatArray]:
    """Trailing-window OLS beta and quadratic b1 ending at each period (NaN before the first).

    Uses running sums of x^k and x^k y, so each window costs O(1) plus a 3x3 solve.
    """
    n = ra.size
    lin = np.full(n, np.nan)
    b1 = np.full(n, np.nan)
    if n < window:
        return lin, b1
    x, y = rb, ra

    def roll(v: FloatArray) -> FloatArray:
        c = np.concatenate([[0.0], np.cumsum(v)])
        return np.asarray(c[window:] - c[:-window], dtype=np.float64)

    s1, s2, s3, s4 = (roll(x**k) for k in range(1, 5))
    s0 = float(window)
    sy, sxy, sx2y = roll(y), roll(x * y), roll(x * x * y)
    varx = s2 - s1**2 / s0
    with np.errstate(divide="ignore", invalid="ignore"):
        lin_w = np.where(varx > window * MIN_BENCH_STD**2, (sxy - s1 * sy / s0) / varx, np.nan)
    m = np.empty((n - window + 1, 3, 3))
    m[:, 0, 0] = s0
    m[:, 0, 1] = m[:, 1, 0] = s1
    m[:, 0, 2] = m[:, 2, 0] = m[:, 1, 1] = s2
    m[:, 1, 2] = m[:, 2, 1] = s3
    m[:, 2, 2] = s4
    rhs = np.stack([sy, sxy, sx2y], axis=1)
    cond = np.linalg.cond(m)
    good = np.isfinite(cond) & (cond < 1e14)
    sol = np.full((m.shape[0], 3), np.nan)
    if good.any():
        sol[good] = np.linalg.solve(m[good], rhs[good][..., None])[..., 0]
    lin[window - 1 :] = lin_w
    b1[window - 1 :] = sol[:, 1]
    return lin, b1


def _thin(n: int, cap: int = MAX_SERIES_POINTS) -> npt.NDArray[np.int64]:
    if n <= cap:
        return np.arange(n, dtype=np.int64)
    return np.unique(np.linspace(0, n - 1, cap).round().astype(np.int64))


def _stability(ra: FloatArray, rb: FloatArray, dates: pd.DatetimeIndex) -> list[dict[str, Any]]:
    """Refit on each half of the window, and without the 1% most extreme benchmark periods."""
    n = ra.size
    half = n // 2
    lo, hi = np.percentile(rb, [0.5, 99.5])
    trimmed = np.flatnonzero((rb >= lo) & (rb <= hi))
    parts = [
        ("First half", np.arange(half), f"{dates[0].date()} to {dates[half - 1].date()}"),
        ("Second half", np.arange(half, n), f"{dates[half].date()} to {dates[-1].date()}"),
        ("Without the most extreme 1%", trimmed, "whole window"),
    ]
    out = []
    for label, idx, span in parts:
        row: dict[str, Any] = {"label": label, "span": span, "n": int(idx.size)}
        if idx.size >= MIN_OBS and not _flat(rb[idx]):
            lf = ols(ra[idx], _design(rb[idx]))
            qf = ols(ra[idx], _design(rb[idx], quadratic=True))
            if lf["ok"] and qf["ok"]:
                row["beta"] = float(lf["coef"][1])
                row["b1"] = float(qf["coef"][1])
                row["b2"] = float(qf["coef"][2])
                row["b2_p_value"] = float(qf["p_robust"][2])
        out.append(row)
    return out


# ─── Full analysis ────────────────────────────────────────────────────────────


def min_observations(rolling_window: int) -> int:
    """Original rule: at least max(30, rolling window + 10) aligned observations."""
    return max(MIN_OBS, rolling_window + 10)


def analyze(
    ra: FloatArray,
    rb: FloatArray,
    dates: pd.DatetimeIndex,
    frequency: Frequency = "daily",
    rolling_window: int = 60,
    do_winsorize: bool = False,
) -> dict[str, Any]:
    """Linear, quadratic, bucket, volatility-regime and rolling betas of ra on rb."""
    ra = np.asarray(ra, dtype=np.float64)
    rb = np.asarray(rb, dtype=np.float64)
    if ra.shape != rb.shape or ra.size != len(dates):
        raise BetaError("Asset and benchmark returns must have the same length.")
    n = ra.size
    need = min_observations(rolling_window)
    word = PERIOD_WORD[frequency]
    if n < need:
        raise BetaError(
            f"Only {n} {word}s of shared history in this window; at least {need} are needed. "
            "Try a longer lookback, a higher frequency or a different ticker."
        )
    if do_winsorize:
        ra, rb = winsorize(ra), winsorize(rb)
    if _flat(rb):
        raise BetaError("The benchmark barely moved in this window, so beta cannot be estimated.")

    lin = ols(ra, _design(rb))
    quad = ols(ra, _design(rb, quadratic=True))
    if not lin["ok"] or not quad["ok"]:
        raise BetaError("The regression could not be estimated on this data.")

    lo, hi = (float(v) for v in np.percentile(rb, [0.5, 99.5]))
    grid = np.linspace(lo, hi, 61)
    s, s_se = sensitivity(quad, grid)
    b = lin["coef"]
    q = quad["coef"]
    levels = []
    for x in SENSITIVITY_LEVELS:
        sv, sv_se = sensitivity(quad, x)
        if x < 0:
            beyond = int((rb <= x).sum())
        elif x > 0:
            beyond = int((rb >= x).sum())
        else:
            beyond = n
        levels.append(
            {
                "benchmark_return": x,
                "estimate": float(sv),
                "ci_low": float(sv - Z95 * sv_se),
                "ci_high": float(sv + Z95 * sv_se),
                "within_range": bool(lo <= x <= hi),
                "observations_beyond": beyond,
            }
        )

    lin_roll, b1_roll = rolling_betas(ra, rb, rolling_window)
    first = rolling_window - 1
    keep = first + _thin(n - first)

    result: dict[str, Any] = {
        "observations": n,
        "linear": {
            "alpha": float(b[0]),
            "beta": _slope_block(lin),
            "r_squared": float(lin["r_squared"]),
        },
        "quadratic": {
            "alpha": float(q[0]),
            "b1": _slope_block(quad, 1),
            "b2": _slope_block(quad, 2),
            "r_squared": float(quad["r_squared"]),
            "r_squared_gain": float(quad["r_squared"] - lin["r_squared"]),
            "sensitivity_levels": levels,
            "curve": {
                "benchmark_return": grid,
                "sensitivity": s,
                "ci_low": s - Z95 * s_se,
                "ci_high": s + Z95 * s_se,
                "fitted_return": q[0] + q[1] * grid + q[2] * grid * grid,
                "linear_fitted_return": b[0] + b[1] * grid,
            },
        },
        "buckets": quantile_buckets(ra, rb),
        "volatility_regimes": vol_regimes(ra, rb),
        "rolling": {
            "window": rolling_window,
            "dates": [str(d.date()) for d in dates[keep]],
            "beta": lin_roll[keep],
            "b1": b1_roll[keep],
        },
        "stability": _stability(ra, rb, dates),
        "scatter": {
            "benchmark": np.round(rb, 5),
            "asset": np.round(ra, 5),
            "dates": [str(d.date()) for d in dates],
        },
        "benchmark_range": {"low": lo, "high": hi, "std": float(np.std(rb, ddof=1))},
        "winsorized": do_winsorize,
    }
    result["findings"] = interpret(result, frequency)
    return result


# ─── Plain-language reading ───────────────────────────────────────────────────

MINUS = "\u2212"


def _fmt(x: float) -> str:
    return f"{x:.2f}".replace("-", MINUS)


def _pct(x: float) -> str:
    if x == 0:
        return "0%"
    return (MINUS if x < 0 else "+") + f"{abs(x) * 100:.0f}%"


def interpret(res: dict[str, Any], frequency: Frequency = "daily") -> list[str]:
    """Short sentences drawn only from the fitted numbers. No advice, no labels like 'safe'."""
    word = PERIOD_WORD[frequency]
    beta = res["linear"]["beta"]
    b2 = res["quadratic"]["b2"]
    out = [
        f"A straight-line fit gives a beta of {_fmt(beta['estimate'])} "
        f"(95% interval {_fmt(beta['ci_low'])} to {_fmt(beta['ci_high'])}): on average the asset "
        f"moved about {_fmt(beta['estimate'])}% for each 1% move in the benchmark."
    ]
    lv = {round(r["benchmark_return"], 4): r for r in res["quadratic"]["sensitivity_levels"]}
    pair = next(
        ((lv[-x], lv[x]) for x in (0.02, 0.01) if lv[-x]["within_range"] and lv[x]["within_range"]),
        None,
    )
    significant = b2["p_value"] < 0.05
    if pair is None:
        out.append(
            f"Benchmark moves in this window were too small to compare sensitivity on large up "
            f"and down {word}s."
        )
    elif not significant:
        out.append(
            f"The curved fit is not clearly different from the straight line (curvature "
            f"p = {b2['p_value']:.2f}), so these data do not show the sensitivity changing with "
            f"the size or direction of the benchmark's move."
        )
    else:
        down, up = pair
        higher = "falls" if down["estimate"] > up["estimate"] else "rises"
        out.append(
            f"The curved fit estimates a sensitivity of {_fmt(down['estimate'])} on a "
            f"{_pct(down['benchmark_return'])} benchmark {word} and {_fmt(up['estimate'])} on a "
            f"{_pct(up['benchmark_return'])} {word}, so it is higher when the benchmark {higher}. "
            f"The curvature is distinguishable from zero (p = {b2['p_value']:.3f}), but the "
            f"in-sample fit improves by only {res['quadratic']['r_squared_gain'] * 100:.1f} "
            f"points of R\u00b2."
        )
    est = [b["beta"]["estimate"] for b in res["buckets"] if b["beta"] is not None]
    if len(est) >= 2:
        out.append(
            f"Bucket betas range from {_fmt(min(est))} to {_fmt(max(est))}. Each uses only a "
            f"narrow slice of benchmark {word}s, so their intervals are wide and differences "
            f"between neighbouring buckets are mostly noise unless the intervals separate."
        )
    edges = [res["buckets"][0], res["buckets"][-1]]
    if any(b["beta"] is None or b["sparse"] for b in edges):
        out.append(
            f"The most extreme benchmark {word}s are few in this window, so the bucket betas at "
            f"the edges are imprecise."
        )
    halves = [r for r in res["stability"][:2] if "b2" in r]
    if significant and len(halves) == 2 and np.sign(halves[0]["b2"]) != np.sign(halves[1]["b2"]):
        out.append(
            "The direction of the curvature flips between the first and second half of the "
            "window, so treat it as unstable."
        )
    return out
