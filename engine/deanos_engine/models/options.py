"""Option pricing: Black-Scholes-Merton, Monte Carlo, binomial trees, implied volatility.

Pure functions of numbers in, numbers out. No I/O. Conventions:

* s spot, k strike, t time to expiry in years, r continuously compounded
  risk-free rate, q continuous dividend yield, sigma annual volatility. Rates
  and volatility are decimals (0.05 = 5%).
* kind is "call" or "put".
* Greeks are per unit of the input (vega per 1.00 of volatility, rho per 1.00
  of rate, theta per year); callers rescale for display.

Degenerate inputs (t == 0 or sigma == 0) have well-defined limits: the
underlying then grows deterministically at r - q and the option is worth its
discounted forward intrinsic value. Every function returns that limit instead
of dividing by zero.
"""

from __future__ import annotations

import math
from typing import Any, Literal

import numpy as np
from scipy.special import ndtr

OptionKind = Literal["call", "put"]
KINDS: tuple[OptionKind, ...] = ("call", "put")

# Below this total volatility (sigma * sqrt(t)) the price is the deterministic limit.
_DEGENERATE = 1e-10
# Largest log-price kept in a binomial tree; exp(600) is finite with headroom for sums.
_LOG_CAP = 600.0
TRADING_DAYS = 252


class OptionsError(ValueError):
    """Inputs that cannot be priced (user error, reported as HTTP 400)."""


def _check(s: float, k: float, t: float, sigma: float, kind: str) -> None:
    for name, v in (("spot", s), ("strike", k), ("time", t), ("volatility", sigma)):
        if not math.isfinite(v):
            raise OptionsError(f"{name.capitalize()} must be a finite number.")
    if s <= 0 or k <= 0:
        raise OptionsError("Spot and strike must be positive.")
    if t < 0 or sigma < 0:
        raise OptionsError("Time and volatility cannot be negative.")
    if kind not in KINDS:
        raise OptionsError("Option type must be call or put.")


def _pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def _cdf(x: float) -> float:
    return float(ndtr(x))


def intrinsic(s: float, k: float, kind: OptionKind) -> float:
    return max(s - k, 0.0) if kind == "call" else max(k - s, 0.0)


# ─── Black-Scholes-Merton ─────────────────────────────────────────────────────


def _d1d2(s: float, k: float, t: float, r: float, q: float, sigma: float) -> tuple[float, float]:
    vol = sigma * math.sqrt(t)
    d1 = (math.log(s / k) + (r - q + 0.5 * sigma * sigma) * t) / vol
    return d1, d1 - vol


def bs_price(
    s: float, k: float, t: float, r: float, q: float, sigma: float, kind: OptionKind
) -> float:
    """European option price under Black-Scholes-Merton with continuous dividend yield."""
    _check(s, k, t, sigma, kind)
    df_r, df_q = math.exp(-r * t), math.exp(-q * t)
    if sigma * math.sqrt(t) < _DEGENERATE:
        fwd = s * df_q - k * df_r
        return max(fwd, 0.0) if kind == "call" else max(-fwd, 0.0)
    d1, d2 = _d1d2(s, k, t, r, q, sigma)
    if kind == "call":
        return s * df_q * _cdf(d1) - k * df_r * _cdf(d2)
    return k * df_r * _cdf(-d2) - s * df_q * _cdf(-d1)


def bs_greeks(
    s: float, k: float, t: float, r: float, q: float, sigma: float, kind: OptionKind
) -> dict[str, float]:
    """Analytic Greeks: delta, gamma, vega (per 1.00 vol), theta (per year), rho (per 1.00 rate)."""
    _check(s, k, t, sigma, kind)
    df_r, df_q = math.exp(-r * t), math.exp(-q * t)
    sign = 1.0 if kind == "call" else -1.0
    if sigma * math.sqrt(t) < _DEGENERATE:
        # Deterministic limit: the option is either surely exercised or surely not.
        if sign * (s * df_q - k * df_r) <= 0:
            return {"delta": 0.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0, "rho": 0.0}
        return {
            "delta": sign * df_q,
            "gamma": 0.0,
            "vega": 0.0,
            "theta": sign * (q * s * df_q - r * k * df_r),
            "rho": sign * k * t * df_r,
        }
    d1, d2 = _d1d2(s, k, t, r, q, sigma)
    sqrt_t = math.sqrt(t)
    pdf1 = _pdf(d1)
    gamma = df_q * pdf1 / (s * sigma * sqrt_t)
    vega = s * df_q * pdf1 * sqrt_t
    common = -s * df_q * pdf1 * sigma / (2.0 * sqrt_t)
    if kind == "call":
        delta = df_q * _cdf(d1)
        theta = common - r * k * df_r * _cdf(d2) + q * s * df_q * _cdf(d1)
        rho = k * t * df_r * _cdf(d2)
    else:
        delta = -df_q * _cdf(-d1)
        theta = common + r * k * df_r * _cdf(-d2) - q * s * df_q * _cdf(-d1)
        rho = -k * t * df_r * _cdf(-d2)
    return {"delta": delta, "gamma": gamma, "vega": vega, "theta": theta, "rho": rho}


def prob_in_the_money(
    s: float, k: float, t: float, r: float, q: float, sigma: float, kind: OptionKind
) -> float:
    """Risk-neutral probability that the option finishes in the money: N(d2) or N(-d2)."""
    _check(s, k, t, sigma, kind)
    sign = 1.0 if kind == "call" else -1.0
    if sigma * math.sqrt(t) < _DEGENERATE:
        return 1.0 if sign * (s * math.exp((r - q) * t) - k) > 0 else 0.0
    _, d2 = _d1d2(s, k, t, r, q, sigma)
    return _cdf(sign * d2)


def parity_gap(s: float, k: float, t: float, r: float, q: float, call: float, put: float) -> float:
    """C - P - (S e^{-qT} - K e^{-rT}); zero for consistent European prices."""
    return call - put - (s * math.exp(-q * t) - k * math.exp(-r * t))


# ─── Monte Carlo (GBM) ────────────────────────────────────────────────────────


def _checkpoints(n: int, start: int = 100, per_decade: int = 8) -> np.ndarray:
    """Roughly log-spaced sample sizes from start to n (inclusive)."""
    if n <= start:
        return np.array([n])
    k = max(2, math.ceil(math.log10(n / start) * per_decade) + 1)
    grid: np.ndarray = np.unique(np.round(np.geomspace(start, n, k)).astype(int))
    return grid


def _running(
    y: np.ndarray, checkpoints: np.ndarray, x: np.ndarray | None = None, x_mean: float = 0.0
) -> tuple[np.ndarray, np.ndarray]:
    """Mean and standard error of y over its first n samples, for each n in checkpoints.

    With a control x of known mean x_mean, uses the control-variate estimator
    y - b (x - x_mean), with b re-estimated on each prefix.
    """
    idx = checkpoints - 1
    n = checkpoints.astype(float)
    dof = np.maximum(n - 1, 1)
    sy = np.cumsum(y)[idx]
    syy = np.cumsum(y * y)[idx]
    var_y = np.maximum(syy - sy * sy / n, 0.0) / dof
    if x is None:
        return sy / n, np.sqrt(var_y / n)
    sx = np.cumsum(x)[idx]
    sxx = np.cumsum(x * x)[idx]
    sxy = np.cumsum(x * y)[idx]
    var_x = np.maximum(sxx - sx * sx / n, 0.0) / dof
    cov = (sxy - sx * sy / n) / dof
    b = np.divide(cov, var_x, out=np.zeros_like(cov), where=var_x > 1e-300)
    mean = sy / n - b * (sx / n - x_mean)
    var_adj = np.maximum(var_y - 2 * b * cov + b * b * var_x, 0.0)
    return mean, np.sqrt(var_adj / n)


def _payoff(st: np.ndarray, k: float, kind: OptionKind) -> np.ndarray:
    out: np.ndarray = np.maximum(st - k, 0.0) if kind == "call" else np.maximum(k - st, 0.0)
    return out


def _summary(mean: float, se: float, paths: int) -> dict[str, Any]:
    return {
        "price": mean,
        "std_error": se,
        "ci95": [mean - 1.96 * se, mean + 1.96 * se],
        "paths": paths,
    }


def mc_european(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    n_paths: int = 20_000,
    seed: int = 42,
) -> dict[str, Any]:
    """Monte Carlo price of a European option under GBM.

    Three estimators on the same budget of n_paths simulated terminal prices:

    * plain: independent draws, no variance reduction.
    * antithetic: pairs (Z, -Z), averaged within each pair.
    * antithetic_control (the headline): antithetic pairs plus the discounted
      terminal price as a control variate, whose expectation S e^{-qT} is
      known exactly.

    Returns each estimate with its standard error and 95% interval, plus
    running estimates at log-spaced path counts for a convergence chart.
    """
    _check(s, k, t, sigma, kind)
    if n_paths < 2:
        raise OptionsError("At least two paths are needed.")
    n_pairs = n_paths // 2
    n_paths = 2 * n_pairs
    rng = np.random.default_rng(seed)
    df = math.exp(-r * t)
    drift = (r - q - 0.5 * sigma * sigma) * t
    vol = sigma * math.sqrt(t)

    z_plain = rng.standard_normal(n_paths)
    y_plain = df * _payoff(s * np.exp(drift + vol * z_plain), k, kind)

    z = rng.standard_normal(n_pairs)
    st_up, st_dn = s * np.exp(drift + vol * z), s * np.exp(drift - vol * z)
    y_anti = 0.5 * df * (_payoff(st_up, k, kind) + _payoff(st_dn, k, kind))
    x_anti = 0.5 * df * (st_up + st_dn)  # discounted terminal price, E = S e^{-qT}
    x_mean = s * math.exp(-q * t)

    cp_paths = _checkpoints(n_paths)
    cp_pairs = np.maximum(cp_paths // 2, 1)
    pm, ps = _running(y_plain, cp_paths)
    am, a_se = _running(y_anti, cp_pairs)
    cm, cs = _running(y_anti, cp_pairs, x_anti, x_mean)

    plain = _summary(float(pm[-1]), float(ps[-1]), n_paths)
    anti = _summary(float(am[-1]), float(a_se[-1]), n_paths)
    best = _summary(float(cm[-1]), float(cs[-1]), n_paths)
    reference = bs_price(s, k, t, r, q, sigma, kind)
    if best["std_error"] > 0:
        within = best["ci95"][0] <= reference <= best["ci95"][1]
    else:
        within = abs(best["price"] - reference) <= 1e-9 * max(1.0, reference)

    def ratio(a: float, b: float) -> float | None:
        return (a / b) ** 2 if b > 0 else None

    return {
        "estimate": best,
        "plain": plain,
        "antithetic": anti,
        "antithetic_control": best,
        "variance_reduction": {
            "antithetic": ratio(plain["std_error"], anti["std_error"]),
            "antithetic_control": ratio(plain["std_error"], best["std_error"]),
        },
        "black_scholes": reference,
        "error_vs_black_scholes": best["price"] - reference,
        "within_ci": bool(within),
        "convergence": {
            "paths": cp_paths,
            "plain": pm,
            "plain_se": ps,
            "controlled": cm,
            "controlled_se": cs,
        },
        "seed": seed,
    }


# ─── Asian option (arithmetic average, Monte Carlo) ───────────────────────────


def geometric_asian_price(
    s: float, k: float, t: float, r: float, q: float, sigma: float, kind: OptionKind, n_obs: int
) -> float:
    """Closed-form price of a discretely monitored geometric-average Asian option.

    The average is taken over n_obs equally spaced dates t_i = i T / n. Under
    GBM the geometric average is lognormal, so the price has a Black-Scholes
    form (Kemna and Vorst, 1990, discrete version).
    """
    _check(s, k, t, sigma, kind)
    if n_obs < 1:
        raise OptionsError("At least one averaging date is needed.")
    dt = t / n_obs
    mu = math.log(s) + (r - q - 0.5 * sigma * sigma) * dt * (n_obs + 1) / 2
    var = sigma * sigma * dt * (n_obs + 1) * (2 * n_obs + 1) / (6 * n_obs)
    df = math.exp(-r * t)
    if var <= _DEGENERATE**2:
        return df * intrinsic(math.exp(mu), k, kind)
    sd = math.sqrt(var)
    d2 = (mu - math.log(k)) / sd
    d1 = d2 + sd
    eg = math.exp(mu + 0.5 * var)
    if kind == "call":
        return df * (eg * _cdf(d1) - k * _cdf(d2))
    return df * (k * _cdf(-d2) - eg * _cdf(-d1))


def mc_asian(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    n_obs: int = 63,
    n_paths: int = 20_000,
    seed: int = 42,
) -> dict[str, Any]:
    """Arithmetic-average Asian option by Monte Carlo.

    No closed form exists for the arithmetic average, which is why Monte Carlo
    is used. Antithetic pairs plus the geometric-average Asian (known in closed
    form, and highly correlated with the arithmetic one) as a control variate.
    """
    _check(s, k, t, sigma, kind)
    if n_obs < 1 or n_paths < 2:
        raise OptionsError("At least one averaging date and two paths are needed.")
    n_pairs = n_paths // 2
    n_paths = 2 * n_pairs
    rng = np.random.default_rng(seed)
    df = math.exp(-r * t)
    dt = t / n_obs
    step_drift = (r - q - 0.5 * sigma * sigma) * dt
    step_vol = sigma * math.sqrt(dt)

    def payoffs(z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        logp = np.cumsum(step_drift + step_vol * z, axis=1)
        arith = s * np.exp(logp).mean(axis=1)
        geo = s * np.exp(logp.mean(axis=1))
        return df * _payoff(arith, k, kind), df * _payoff(geo, k, kind)

    ya = np.empty(n_pairs)
    xg = np.empty(n_pairs)
    y_single = np.empty(n_pairs)
    chunk = max(1, 200_000 // n_obs)  # bounds working memory
    for lo in range(0, n_pairs, chunk):
        hi = min(n_pairs, lo + chunk)
        z = rng.standard_normal((hi - lo, n_obs))
        a_up, g_up = payoffs(z)
        a_dn, g_dn = payoffs(-z)
        ya[lo:hi] = 0.5 * (a_up + a_dn)
        xg[lo:hi] = 0.5 * (g_up + g_dn)
        y_single[lo:hi] = a_up

    geo_exact = geometric_asian_price(s, k, t, r, q, sigma, kind, n_obs)
    cp_pairs = _checkpoints(n_pairs, start=50)
    cm, cs = _running(ya, cp_pairs, xg, geo_exact)
    # The up-paths alone are n_pairs independent draws; plain Monte Carlo on the
    # full budget of n_paths would have a standard error sqrt(2) smaller.
    _, single_se = _running(y_single, np.array([n_pairs]))
    plain_se = float(single_se[-1]) / math.sqrt(2)
    price, se = float(cm[-1]), float(cs[-1])
    return {
        "estimate": _summary(price, se, n_paths),
        "plain_std_error": plain_se,
        "variance_reduction": (plain_se / se) ** 2 if se > 0 else None,
        "geometric_closed_form": geo_exact,
        "european_black_scholes": bs_price(s, k, t, r, q, sigma, kind),
        "averaging_dates": n_obs,
        "convergence": {"paths": 2 * cp_pairs, "controlled": cm, "controlled_se": cs},
        "seed": seed,
    }


# ─── Barrier options (discretely monitored, Monte Carlo) ──────────────────────

BarrierType = Literal["up-and-out", "up-and-in", "down-and-out", "down-and-in"]
BARRIER_TYPES: tuple[BarrierType, ...] = ("up-and-out", "up-and-in", "down-and-out", "down-and-in")
# Broadie, Glasserman and Kou (1997): a barrier checked on m equally spaced dates
# prices close to a continuously monitored one shifted away from the spot by
# exp(beta * sigma * sqrt(T / m)), beta = -zeta(1/2) / sqrt(2 pi).
BGK_BETA = 0.5826


def _check_barrier(s: float, barrier: float, barrier_type: str) -> None:
    if barrier_type not in BARRIER_TYPES:
        raise OptionsError(f"barrier type must be one of {', '.join(BARRIER_TYPES)}.")
    if not (math.isfinite(barrier) and barrier > 0):
        raise OptionsError("The barrier must be a positive number.")


def barrier_breached(s: float, barrier: float, barrier_type: BarrierType) -> bool:
    """Whether the spot is already at or beyond the barrier at the start."""
    return s >= barrier if barrier_type.startswith("up") else s <= barrier


def barrier_price_continuous(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    barrier: float,
    barrier_type: BarrierType,
) -> float:
    """Closed-form price of a continuously monitored barrier option (no rebate).

    Merton (1973) and Reiner and Rubinstein (1991), in the notation of Hull,
    Options, Futures, and Other Derivatives. Knock-in + knock-out equals the
    European price exactly, so each out price is the European minus the in price
    (or the other way round). If the spot is already at or beyond the barrier the
    knock-out is worth 0 and the knock-in is the European option.
    """
    _check(s, k, t, sigma, kind)
    _check_barrier(s, barrier, barrier_type)
    vanilla = bs_price(s, k, t, r, q, sigma, kind)
    knock_in = barrier_type.endswith("in")
    if barrier_breached(s, barrier, barrier_type):
        return vanilla if knock_in else 0.0
    if t <= 0 or sigma * math.sqrt(t) < _DEGENERATE:
        # Deterministic path s e^{(r-q)u}: monotone, so it crosses only if the
        # endpoint is beyond the barrier.
        end = s * math.exp((r - q) * t)
        crossed = end >= barrier if barrier_type.startswith("up") else end <= barrier
        hit = vanilla if crossed else 0.0
        return hit if knock_in else vanilla - hit

    h = barrier
    sq = sigma * math.sqrt(t)
    lam = (r - q + 0.5 * sigma * sigma) / (sigma * sigma)
    y = math.log(h * h / (s * k)) / sq + lam * sq
    x1 = math.log(s / h) / sq + lam * sq
    y1 = math.log(h / s) / sq + lam * sq
    se, kd = s * math.exp(-q * t), k * math.exp(-r * t)
    # (H/S)^(2 lambda) in log space: finite for any barrier the API accepts.
    a = math.exp(min(_LOG_CAP, 2 * lam * math.log(h / s)))
    b = math.exp(min(_LOG_CAP, (2 * lam - 2) * math.log(h / s)))
    n = _cdf

    if kind == "call":
        if barrier_type.startswith("down"):
            if h <= k:
                di = se * a * n(y) - kd * b * n(y - sq)
            else:
                do = se * n(x1) - kd * n(x1 - sq) - se * a * n(y1) + kd * b * n(y1 - sq)
                di = vanilla - do
            value_in = di
        else:
            if h <= k:
                value_in = vanilla
            else:
                value_in = (
                    se * n(x1)
                    - kd * n(x1 - sq)
                    - se * a * (n(-y) - n(-y1))
                    + kd * b * (n(-y + sq) - n(-y1 + sq))
                )
    else:
        if barrier_type.startswith("up"):
            if h >= k:
                value_in = -se * a * n(-y) + kd * b * n(-y + sq)
            else:
                uo = -se * n(-x1) + kd * n(-x1 + sq) + se * a * n(-y1) - kd * b * n(-y1 + sq)
                value_in = vanilla - uo
        else:
            if h >= k:
                value_in = vanilla
            else:
                value_in = (
                    -se * n(-x1)
                    + kd * n(-x1 + sq)
                    + se * a * (n(y) - n(y1))
                    - kd * b * (n(y - sq) - n(y1 - sq))
                )
    value_in = min(max(value_in, 0.0), vanilla)
    return value_in if knock_in else max(vanilla - value_in, 0.0)


def barrier_price_bgk(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    barrier: float,
    barrier_type: BarrierType,
    n_obs: int,
) -> float:
    """Approximate price of the barrier checked on n_obs equal dates (BGK correction).

    The continuous formula with the barrier moved away from the spot by
    exp(0.5826 sigma sqrt(T / n_obs)). An approximation, accurate when the
    barrier is not very close to the spot; the Monte Carlo price is the
    reference for the discrete contract.
    """
    _check(s, k, t, sigma, kind)
    _check_barrier(s, barrier, barrier_type)
    if n_obs < 1:
        raise OptionsError("At least one monitoring date is needed.")
    if barrier_breached(s, barrier, barrier_type):
        return bs_price(s, k, t, r, q, sigma, kind) if barrier_type.endswith("in") else 0.0
    shift = math.exp(BGK_BETA * sigma * math.sqrt(t / n_obs))
    h = barrier * shift if barrier_type.startswith("up") else barrier / shift
    return barrier_price_continuous(s, k, t, r, q, sigma, kind, h, barrier_type)


def _barrier_paths(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    barrier: float,
    barrier_type: BarrierType,
    z: np.ndarray,
    bridge: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Discounted barrier payoff, discounted vanilla payoff and survival for each row of z.

    Survival is 1 if the barrier was never touched (0 or 1 on the monitoring
    dates; a probability with the bridge).

    Log-prices are exact under GBM on the monitoring dates. With bridge=True the
    probability that the path crossed between two dates (Brownian bridge) is
    used instead of the dates alone, giving an estimator of the continuously
    monitored price.
    """
    n_obs = z.shape[1]
    dt = t / n_obs
    step_drift = (r - q - 0.5 * sigma * sigma) * dt
    step_vol = sigma * math.sqrt(dt)
    logp = math.log(s) + np.cumsum(step_drift + step_vol * z, axis=1)
    df = math.exp(-r * t)
    vanilla = df * _payoff(np.exp(logp[:, -1]), k, kind)
    lh = math.log(barrier)
    up = barrier_type.startswith("up")
    if bridge:
        prev = np.concatenate([np.full((z.shape[0], 1), math.log(s)), logp[:, :-1]], axis=1)
        a, b = lh - prev, lh - logp
        beyond = (a <= 0) | (b <= 0) if up else (a >= 0) | (b >= 0)
        var = sigma * sigma * dt
        cross = np.where(
            beyond, 1.0, np.exp(-2.0 * np.maximum(a * b, 0.0) / var) if var > 0 else 0.0
        )
        survive = np.prod(1.0 - cross, axis=1)
    else:
        hit = (logp >= lh).any(axis=1) if up else (logp <= lh).any(axis=1)
        survive = (~hit).astype(float)
    if barrier_breached(s, barrier, barrier_type):
        survive = np.zeros_like(vanilla)  # the barrier is already hit at t = 0
    alive = vanilla * survive
    value = vanilla - alive if barrier_type.endswith("in") else alive
    return value, vanilla, survive


def mc_barrier(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    barrier: float,
    barrier_type: BarrierType,
    n_obs: int = 52,
    n_paths: int = 20_000,
    seed: int = 42,
) -> dict[str, Any]:
    """Barrier option checked on n_obs equally spaced dates, by Monte Carlo.

    The contract is discretely monitored: the barrier only counts on the n_obs
    dates (t_i = i T / n_obs). Paths that cross between two dates and come back
    are not knocked out, so a discrete knock-out is worth more than the
    continuous closed form and a discrete knock-in less; the gap shrinks
    roughly like 1 / sqrt(n_obs). The result carries three references: the
    European price, the continuous closed form and its BGK-corrected version
    (an approximation to the discrete price).

    Antithetic pairs; the standard error and 95% interval are over pairs.
    """
    _check(s, k, t, sigma, kind)
    _check_barrier(s, barrier, barrier_type)
    if n_obs < 1 or n_paths < 2:
        raise OptionsError("At least one monitoring date and two paths are needed.")
    n_pairs = n_paths // 2
    n_paths = 2 * n_pairs
    breached = barrier_breached(s, barrier, barrier_type)
    rng = np.random.default_rng(seed)
    y = np.empty(n_pairs)
    y_single = np.empty(n_pairs)
    hits = 0.0
    chunk = max(1, 200_000 // n_obs)
    for lo in range(0, n_pairs, chunk):
        hi = min(n_pairs, lo + chunk)
        z = rng.standard_normal((hi - lo, n_obs))
        v_up, _, alive_up = _barrier_paths(s, k, t, r, q, sigma, kind, barrier, barrier_type, z)
        v_dn, _, alive_dn = _barrier_paths(s, k, t, r, q, sigma, kind, barrier, barrier_type, -z)
        y[lo:hi] = 0.5 * (v_up + v_dn)
        y_single[lo:hi] = v_up
        # Paths that touched the barrier on a monitoring date (both halves of each pair).
        hits += float(2 * (hi - lo) - alive_up.sum() - alive_dn.sum())

    cp_pairs = _checkpoints(n_pairs, start=50)
    cm, cs = _running(y, cp_pairs)
    _, single_se = _running(y_single, np.array([n_pairs]))
    plain_se = float(single_se[-1]) / math.sqrt(2)
    price, se = float(cm[-1]), float(cs[-1])
    return {
        "estimate": _summary(price, se, n_paths),
        "plain_std_error": plain_se,
        "variance_reduction": (plain_se / se) ** 2 if se > 0 else None,
        "barrier": barrier,
        "barrier_type": barrier_type,
        "monitoring_dates": n_obs,
        "breached_at_start": breached,
        "hit_share": hits / n_paths,
        "continuous_closed_form": barrier_price_continuous(
            s, k, t, r, q, sigma, kind, barrier, barrier_type
        ),
        "discrete_bgk": barrier_price_bgk(s, k, t, r, q, sigma, kind, barrier, barrier_type, n_obs),
        "european_black_scholes": bs_price(s, k, t, r, q, sigma, kind),
        "convergence": {"paths": 2 * cp_pairs, "controlled": cm, "controlled_se": cs},
        "seed": seed,
    }


def mc_barrier_continuous(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    barrier: float,
    barrier_type: BarrierType,
    n_steps: int = 50,
    n_paths: int = 20_000,
    seed: int = 42,
) -> dict[str, Any]:
    """Continuously monitored barrier price by Monte Carlo with a Brownian-bridge correction.

    An independent check of the closed form: unbiased for the continuous
    contract at any step count, because the crossing probability between two
    simulated dates is exact under GBM.
    """
    _check(s, k, t, sigma, kind)
    _check_barrier(s, barrier, barrier_type)
    rng = np.random.default_rng(seed)
    n_pairs = max(1, n_paths // 2)
    y = np.empty(n_pairs)
    chunk = max(1, 200_000 // n_steps)
    for lo in range(0, n_pairs, chunk):
        hi = min(n_pairs, lo + chunk)
        z = rng.standard_normal((hi - lo, n_steps))
        v_up, _, _ = _barrier_paths(
            s, k, t, r, q, sigma, kind, barrier, barrier_type, z, bridge=True
        )
        v_dn, _, _ = _barrier_paths(
            s, k, t, r, q, sigma, kind, barrier, barrier_type, -z, bridge=True
        )
        y[lo:hi] = 0.5 * (v_up + v_dn)
    m, e = _running(y, np.array([n_pairs]))
    return _summary(float(m[-1]), float(e[-1]), 2 * n_pairs)


# ─── Binomial tree (Cox-Ross-Rubinstein) ──────────────────────────────────────


def binomial_price(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    steps: int = 500,
    american: bool = True,
) -> float:
    """Cox-Ross-Rubinstein binomial tree, European or American exercise.

    u = e^{sigma sqrt(dt)}, d = 1/u, risk-neutral p = (e^{(r-q)dt} - d) / (u - d).
    When the drift is large relative to volatility, p leaves (0, 1) and the
    CRR tree admits arbitrage; the tree is then centered on the drift
    (u, d = e^{(r-q)dt +/- sigma sqrt(dt)}), which keeps p near one half and
    converges to the same limit.
    """
    _check(s, k, t, sigma, kind)
    if steps < 1:
        raise OptionsError("The tree needs at least one step.")
    sign = 1.0 if kind == "call" else -1.0
    dt = t / steps
    if sigma * math.sqrt(dt) < _DEGENERATE:
        # Deterministic path: exercise on the best date (American) or at expiry.
        times = np.linspace(0.0, t, steps + 1) if american else np.array([t])
        path = s * np.exp((r - q) * times)
        vals = np.exp(-r * times) * np.maximum(sign * (path - k), 0.0)
        return float(vals.max())
    growth = math.exp((r - q) * dt)
    up = sigma * math.sqrt(dt)
    log_u, log_d = up, -up
    p = (growth - math.exp(log_d)) / (math.exp(log_u) - math.exp(log_d))
    if not 0.0 < p < 1.0:
        log_u, log_d = (r - q) * dt + up, (r - q) * dt - up
        p = (growth - math.exp(log_d)) / (math.exp(log_u) - math.exp(log_d))
    disc = math.exp(-r * dt)
    pu, pd = disc * p, disc * (1.0 - p)

    log_s0 = math.log(s)
    j = np.arange(steps + 1)

    def node_spots(n: int) -> np.ndarray:
        jn = j[: n + 1]
        spots: np.ndarray = np.exp(
            np.clip(log_s0 + jn * log_u + (n - jn) * log_d, -_LOG_CAP, _LOG_CAP)
        )
        return spots

    values = np.maximum(sign * (node_spots(steps) - k), 0.0)
    for n in range(steps - 1, -1, -1):
        values = pu * values[1:] + pd * values[:-1]
        if american:
            np.maximum(values, sign * (node_spots(n) - k), out=values)
    return float(values[0])


BINOMIAL_GRID = (5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500)


def binomial_convergence(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    max_steps: int,
) -> dict[str, Any]:
    """European and American tree prices at increasing step counts, up to max_steps."""
    grid = sorted({n for n in BINOMIAL_GRID if n <= max_steps} | {max_steps})
    return {
        "steps": grid,
        "european": [binomial_price(s, k, t, r, q, sigma, kind, n, american=False) for n in grid],
        "american": [binomial_price(s, k, t, r, q, sigma, kind, n, american=True) for n in grid],
    }


# ─── Implied volatility ───────────────────────────────────────────────────────

IV_MIN, IV_MAX = 1e-6, 10.0


def price_bounds(
    s: float, k: float, t: float, r: float, q: float, kind: OptionKind
) -> tuple[float, float]:
    """No-arbitrage bounds of a European price: (sigma -> 0 limit, sigma -> infinity limit)."""
    fs, fk = s * math.exp(-q * t), k * math.exp(-r * t)
    if kind == "call":
        return max(fs - fk, 0.0), fs
    return max(fk - fs, 0.0), fk


def implied_vol(
    price: float,
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    kind: OptionKind,
    tol: float = 1e-10,
    max_iter: int = 100,
) -> dict[str, Any]:
    """Volatility at which the Black-Scholes-Merton price equals price.

    Newton-Raphson on sigma, safeguarded by a bracket that shrinks every
    iteration: whenever a Newton step would leave the bracket (or vega is too
    small to trust), the solver bisects instead. The price rises monotonically
    with sigma, so the bracket always contains the answer and the method
    cannot diverge.
    """
    _check(s, k, t, 0.0, kind)
    if not math.isfinite(price):
        raise OptionsError("Option price must be a finite number.")
    if t <= 0:
        raise OptionsError("Implied volatility needs a time to expiry above zero.")
    lower, upper = price_bounds(s, k, t, r, q, kind)
    scale = max(upper, 1e-300)
    if price < lower - 1e-9 * scale:
        raise OptionsError(
            f"A price of {price:.4f} is below the no-arbitrage minimum of {lower:.4f}; "
            "no volatility produces it."
        )
    if price >= upper * (1 - 1e-12):
        raise OptionsError(
            f"A price of {price:.4f} is at or above the no-arbitrage maximum of {upper:.4f}; "
            "no volatility produces it."
        )
    if price - lower <= 1e-12 * scale:
        return {
            "sigma": 0.0,
            "iterations": 0,
            "steps": {"newton": 0, "bisection": 0},
            "method": "boundary",
            "converged": True,
            "repriced": lower,
            "bounds": [lower, upper],
        }

    lo, hi = IV_MIN, IV_MAX
    if bs_price(s, k, t, r, q, hi, kind) < price:
        raise OptionsError("That price implies a volatility above 1,000% a year.")
    # Manaster-Koehler starting point, kept inside a sensible range.
    fwd = s * math.exp((r - q) * t)
    x = min(max(math.sqrt(2.0 * abs(math.log(fwd / k)) / t), 0.1), 2.0)
    steps = {"newton": 0, "bisection": 0}
    converged = False
    iterations = 0
    while iterations < max_iter:
        iterations += 1
        f = bs_price(s, k, t, r, q, x, kind) - price
        if abs(f) <= tol * max(1.0, price):
            converged = True
            break
        if f > 0:
            hi = x
        else:
            lo = x
        vega = bs_greeks(s, k, t, r, q, x, kind)["vega"]
        nxt = x - f / vega if vega > 1e-12 * max(1.0, s) else math.nan
        if math.isfinite(nxt) and lo < nxt < hi:
            x = nxt
            steps["newton"] += 1
        else:
            x = 0.5 * (lo + hi)
            steps["bisection"] += 1
        if hi - lo < 1e-14:
            converged = True
            break
    return {
        "sigma": x,
        "iterations": iterations,
        "steps": steps,
        "method": "newton" if steps["bisection"] == 0 else "newton+bisection",
        "converged": converged,
        "repriced": bs_price(s, k, t, r, q, x, kind),
        "bounds": [lower, upper],
    }


# ─── Historical volatility ────────────────────────────────────────────────────


def realized_vol(prices: np.ndarray, window: int) -> float:
    """Annualized standard deviation of the last window daily log returns."""
    p = np.asarray(prices, dtype=float)
    p = p[np.isfinite(p) & (p > 0)]
    if window < 2 or len(p) < window + 1:
        raise OptionsError(f"Need at least {window + 1} prices for a {window}-day volatility.")
    rets = np.diff(np.log(p[-(window + 1) :]))
    return float(np.std(rets, ddof=1) * math.sqrt(TRADING_DAYS))


# ─── Curves for charts ────────────────────────────────────────────────────────


def spot_grid(s: float, k: float, t: float, sigma: float, n: int = 61) -> np.ndarray:
    """Spot prices spanning about three standard deviations around the strike and spot.

    The current spot and the strike are always grid points, so charts can mark them exactly.
    """
    spread = max(0.25, min(3.0 * sigma * math.sqrt(max(t, 1e-6)), 1.5))
    base = np.linspace(min(k, s) * math.exp(-spread), max(k, s) * math.exp(spread), n)
    grid: np.ndarray = np.unique(np.concatenate([base, [s, k]]))
    return grid


def value_curves(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind,
    american_steps: int = 150,
) -> dict[str, Any]:
    """Option value, payoff at expiry and Greeks across spot prices, other inputs fixed."""
    grid = [float(x) for x in spot_grid(s, k, t, sigma)]
    greeks = [bs_greeks(x, k, t, r, q, sigma, kind) for x in grid]
    return {
        "spot": grid,
        "payoff": [intrinsic(x, k, kind) for x in grid],
        "european": [bs_price(x, k, t, r, q, sigma, kind) for x in grid],
        "american": [
            binomial_price(x, k, t, r, q, sigma, kind, american_steps, american=True) for x in grid
        ],
        **{name: [g[name] for g in greeks] for name in ("delta", "gamma", "vega", "theta", "rho")},
    }


def price_vs_vol(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    kind: OptionKind,
    sigma_max: float = 1.5,
    include: float | None = None,
) -> dict[str, Any]:
    """Black-Scholes-Merton price across volatilities; include adds one exact grid point."""
    grid = np.linspace(0.01, sigma_max, 60)
    if include is not None and 0 <= include <= sigma_max:
        grid = np.unique(np.concatenate([grid, [include]]))
    vols = [float(v) for v in grid]
    return {"sigma": vols, "price": [bs_price(s, k, t, r, q, v, kind) for v in vols]}


# ─── Reference checks (published on the methodology pages) ────────────────────

_HULL_GREEKS = {"s": 49.0, "k": 50.0, "t": 20 / 52, "r": 0.05, "q": 0.0, "sigma": 0.20}

TEXTBOOK_CASES: list[dict[str, Any]] = [
    {
        "id": "bs-call",
        "model": "black-scholes",
        "label": "European call, S=42, K=40, r=10%, σ=20%, T=0.5",
        "inputs": {"s": 42.0, "k": 40.0, "t": 0.5, "r": 0.10, "q": 0.0, "sigma": 0.20},
        "kind": "call",
        "expected": 4.76,
        "decimals": 2,
    },
    {
        "id": "bs-put",
        "model": "black-scholes",
        "label": "European put, same inputs",
        "inputs": {"s": 42.0, "k": 40.0, "t": 0.5, "r": 0.10, "q": 0.0, "sigma": 0.20},
        "kind": "put",
        "expected": 0.81,
        "decimals": 2,
    },
    {
        "id": "bsm-index-call",
        "model": "black-scholes",
        "label": "Index call with dividend yield, S=930, K=900, r=8%, q=3%, σ=20%, T=2 months",
        "inputs": {"s": 930.0, "k": 900.0, "t": 2 / 12, "r": 0.08, "q": 0.03, "sigma": 0.20},
        "kind": "call",
        "expected": 51.83,
        "decimals": 2,
    },
    *[
        {
            "id": f"greek-{g}",
            "model": "greeks",
            "label": f"Call {label}, S=49, K=50, r=5%, σ=20%, T=20 weeks",
            "inputs": _HULL_GREEKS,
            "kind": "call",
            "greek": g,
            "expected": expected,
            "decimals": decimals,
        }
        for g, label, expected, decimals in (
            ("delta", "delta", 0.522, 3),
            ("gamma", "gamma", 0.066, 3),
            ("vega", "vega (per 1.00 of volatility)", 12.1, 1),
            ("theta", "theta (per year)", -4.31, 2),
            ("rho", "rho (per 1.00 of rate)", 8.91, 2),
        )
    ],
    {
        "id": "binomial-american-put",
        "model": "binomial",
        "label": "American put, 5-step tree, S=50, K=50, r=10%, σ=40%, T=5 months",
        "inputs": {"s": 50.0, "k": 50.0, "t": 5 / 12, "r": 0.10, "q": 0.0, "sigma": 0.40},
        "kind": "put",
        "steps": 5,
        "expected": 4.49,
        "decimals": 2,
    },
    {
        "id": "implied-vol",
        "model": "implied-vol",
        "label": "Implied volatility of a call priced at 1.875, S=21, K=20, r=10%, T=0.25",
        "inputs": {"s": 21.0, "k": 20.0, "t": 0.25, "r": 0.10, "q": 0.0},
        "kind": "call",
        "price": 1.875,
        "expected": 0.235,
        "decimals": 3,
    },
]
TEXTBOOK_SOURCE = "Hull, J. C., Options, Futures, and Other Derivatives (worked examples)"


def textbook_value(case: dict[str, Any]) -> float:
    i = case["inputs"]
    base = (i["s"], i["k"], i["t"], i["r"], i["q"])
    kind: OptionKind = case["kind"]
    model = case["model"]
    if model == "black-scholes":
        return bs_price(*base, i["sigma"], kind)
    if model == "greeks":
        return bs_greeks(*base, i["sigma"], kind)[case["greek"]]
    if model == "binomial":
        return binomial_price(*base, i["sigma"], kind, case["steps"], american=True)
    if model == "implied-vol":
        return float(implied_vol(case["price"], *base, kind)["sigma"])
    raise ValueError(f"unknown model {model}")


VALIDATION_BASE = (100.0, 100.0, 1.0, 0.05, 0.02, 0.25)  # s, k, t, r, q, sigma


def validation_report(seed: int = 42) -> dict[str, Any]:
    """Recompute the published checks.

    Textbook values, Monte Carlo interval coverage, binomial convergence and
    implied-volatility round trips.
    """
    textbook = []
    for case in TEXTBOOK_CASES:
        got = textbook_value(case)
        d = case["decimals"]
        textbook.append(
            {
                "id": case["id"],
                "model": case["model"],
                "label": case["label"],
                "expected": case["expected"],
                "computed": got,
                "decimals": d,
                "matches": round(got, d) == round(case["expected"], d),
            }
        )

    # Monte Carlo coverage: how often does the 95% interval contain the exact price?
    s, k, t, r, q, sigma = VALIDATION_BASE
    runs, paths, hits, errors = 1000, 20_000, 0, []
    exact_call = bs_price(s, k, t, r, q, sigma, "call")
    for i in range(runs):
        res = mc_european(s, k, t, r, q, sigma, "call", n_paths=paths, seed=seed + i)
        hits += int(res["within_ci"])
        errors.append(res["estimate"]["price"] - exact_call)
    one = mc_european(s, k, t, r, q, sigma, "call", n_paths=paths, seed=seed)

    # Binomial convergence to Black-Scholes for a European put.
    exact_put = bs_price(s, k, t, r, q, sigma, "put")
    tree = []
    for n in (50, 100, 500, 1000, 2000):
        v = binomial_price(s, k, t, r, q, sigma, "put", steps=n, american=False)
        tree.append({"steps": n, "price": v, "error": v - exact_put})

    # Implied-volatility round trips over strikes, maturities and volatilities.
    worst, count, skipped = 0.0, 0, 0
    for kind in KINDS:
        for strike in (60.0, 80.0, 100.0, 120.0, 150.0):
            for tt in (0.02, 0.25, 1.0, 5.0):
                for sig in (0.05, 0.2, 0.5, 1.0):
                    p = bs_price(100.0, strike, tt, 0.03, 0.01, sig, kind)
                    lo_b, hi_b = price_bounds(100.0, strike, tt, 0.03, 0.01, kind)
                    # A price within 1e-8 of a bound carries no information about sigma.
                    if p - lo_b < 1e-8 * hi_b or hi_b - p < 1e-8 * hi_b:
                        skipped += 1
                        continue
                    got = implied_vol(p, 100.0, strike, tt, 0.03, 0.01, kind)["sigma"]
                    worst = max(worst, abs(got - sig))
                    count += 1

    inputs = dict(zip(("s", "k", "t", "r", "q", "sigma"), VALIDATION_BASE, strict=True))
    return {
        "source": TEXTBOOK_SOURCE,
        "textbook": textbook,
        "monte_carlo": {
            "inputs": {**inputs, "kind": "call"},
            "runs": runs,
            "paths": paths,
            "coverage": hits / runs,
            "mean_error": float(np.mean(errors)),
            "rmse": float(np.sqrt(np.mean(np.square(errors)))),
            "black_scholes": exact_call,
            "variance_reduction": one["variance_reduction"],
        },
        "binomial": {"inputs": {**inputs, "kind": "put"}, "black_scholes": exact_put, "rows": tree},
        "implied_vol": {"cases": count, "skipped_at_bounds": skipped, "max_abs_error": worst},
        "barrier": barrier_validation(seed=seed),
    }


# ─── Monte Carlo vs Black-Scholes on a real ticker ────────────────────────────

EXAMPLE_TICKER = "NVDA"
EXAMPLE_PATHS = 100_000
EXAMPLE_TERM = 0.25  # years: a three-month at-the-money call
EXAMPLE_RATE = 0.04


def mc_vs_black_scholes(
    s: float,
    k: float,
    t: float,
    r: float,
    q: float,
    sigma: float,
    kind: OptionKind = "call",
    n_paths: int = EXAMPLE_PATHS,
    seed: int = 42,
) -> dict[str, Any]:
    """One Monte Carlo run against the exact Black-Scholes price, for each estimator.

    The difference of a single run is noise of the size of its standard error,
    so each row also reports the difference in standard errors (z) and whether
    the 95% interval contains the exact price.
    """
    res = mc_european(s, k, t, r, q, sigma, kind, n_paths=n_paths, seed=seed)
    bs = float(res["black_scholes"])
    rows = []
    for key in ("plain", "antithetic", "antithetic_control"):
        e = res[key]
        diff = float(e["price"]) - bs
        se = float(e["std_error"])
        rows.append(
            {
                "estimator": key,
                "price": float(e["price"]),
                "std_error": se,
                "ci95": [float(v) for v in e["ci95"]],
                "difference": diff,
                "difference_pct": 100 * diff / bs if bs > 0 else None,
                "z": diff / se if se > 0 else None,
                "within_ci": bool(e["ci95"][0] <= bs <= e["ci95"][1]),
            }
        )
    return {
        "inputs": {"s": s, "k": k, "t": t, "r": r, "q": q, "sigma": sigma, "kind": kind},
        "paths": int(res["estimate"]["paths"]),
        "seed": seed,
        "black_scholes": bs,
        "rows": rows,
    }


# Barrier checks published on the methodology page: closed form vs an
# independent Brownian-bridge simulation, and discrete monitoring vs BGK.
BARRIER_CASES: tuple[tuple[OptionKind, BarrierType, float], ...] = (
    ("call", "up-and-out", 120.0),
    ("call", "down-and-in", 90.0),
    ("put", "down-and-out", 80.0),
    ("put", "up-and-in", 110.0),
)


def barrier_validation(seed: int = 42, paths: int = 200_000) -> dict[str, Any]:
    s, k, t, r, q, sigma = VALIDATION_BASE
    rows = []
    for kind, btype, h in BARRIER_CASES:
        closed = barrier_price_continuous(s, k, t, r, q, sigma, kind, h, btype)
        bridge = mc_barrier_continuous(
            s, k, t, r, q, sigma, kind, h, btype, n_steps=50, n_paths=paths, seed=seed
        )
        discrete = {}
        for n_obs in (12, 52, 252):
            mc = mc_barrier(
                s,
                k,
                t,
                r,
                q,
                sigma,
                kind,
                h,
                btype,
                n_obs=n_obs,
                n_paths=min(paths, 1_000_000 // n_obs * 20),
                seed=seed,
            )
            discrete[str(n_obs)] = {
                "monte_carlo": mc["estimate"]["price"],
                "std_error": mc["estimate"]["std_error"],
                "bgk": mc["discrete_bgk"],
            }
        rows.append(
            {
                "kind": kind,
                "barrier_type": btype,
                "barrier": h,
                "closed_form": closed,
                "bridge": bridge["price"],
                "bridge_std_error": bridge["std_error"],
                "bridge_within_ci": bool(bridge["ci95"][0] <= closed <= bridge["ci95"][1]),
                "discrete": discrete,
                "european": bs_price(s, k, t, r, q, sigma, kind),
            }
        )
    inputs = dict(zip(("s", "k", "t", "r", "q", "sigma"), VALIDATION_BASE, strict=True))
    return {"inputs": inputs, "paths": paths, "bridge_steps": 50, "rows": rows}
