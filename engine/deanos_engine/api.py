"""FastAPI app served by Vercel under the /deanos/api prefix.

Vercel Services passes the original request path through to the service, so
routes are mounted under the full public prefix.

Every analysis endpoint is a GET whose portfolio lives in the query string
(``p=SPY:40,AGG:60``). Nothing is stored. Responses depend only on the query
and the nightly data snapshot, so the CDN can cache them.
"""

from __future__ import annotations

import logging
import platform
import re
import time
from collections.abc import Callable
from importlib.metadata import version
from typing import Annotated, Any, Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from deanos_engine import __version__
from deanos_engine._json import clean
from deanos_engine.data import DataUnavailableError, Snapshot, get_snapshot
from deanos_engine.demos import DEMOS, spec
from deanos_engine.models import (
    beta,
    compare,
    factors,
    garch,
    metrics,
    montecarlo,
    options,
    regime,
    stress,
    transactions,
    var,
)
from deanos_engine.portfolio import (
    TRADING_DAYS,
    PortfolioData,
    PortfolioError,
    align,
    normalize_ticker,
    parse_portfolio,
    prepare,
)

API_PREFIX = "/deanos/api"
CACHE_HEADER = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
BENCHMARKS = ("SPY", "QQQ", "AGG")
# paths x horizon bound: each simulated day is ~8 bytes in several working arrays.
MAX_SIM_CELLS = 5_000_000
# Asian option paths x averaging dates; each cell is simulated twice (antithetic).
MAX_OPTION_CELLS = 2_000_000

app = FastAPI(
    title="DeanOS engine",
    version=__version__,
    docs_url=f"{API_PREFIX}/docs",
    openapi_url=f"{API_PREFIX}/openapi.json",
    redoc_url=None,
)
router = APIRouter(prefix=API_PREFIX)
log = logging.getLogger("deanos.api")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Resource-Policy": "same-origin",
}
# JSON responses load nothing; the interactive docs page needs its CDN assets.
API_CSP = "default-src 'none'; frame-ancestors 'none'"


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        if not request.url.path.startswith(f"{API_PREFIX}/docs"):
            response.headers.setdefault("Content-Security-Policy", API_CSP)
        if response.status_code >= 500:
            response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(SecurityHeaders)

PortfolioQuery = Annotated[
    str,
    Query(
        alias="p",
        max_length=400,
        description="Holdings as TICKER:WEIGHT pairs, e.g. SPY:40,AGG:60. Weights are relative.",
    ),
]
Years = Annotated[int, Query(ge=2, le=26)]


@app.exception_handler(PortfolioError)
async def _portfolio_error(_: Request, exc: PortfolioError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.exception_handler(options.OptionsError)
async def _options_error(_: Request, exc: options.OptionsError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.exception_handler(transactions.TransactionsError)
async def _transactions_error(_: Request, exc: transactions.TransactionsError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.exception_handler(beta.BetaError)
async def _beta_error(_: Request, exc: beta.BetaError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields = sorted({str(e["loc"][-1]) for e in exc.errors() if e.get("loc")})
    msg = f"Invalid value for {', '.join(fields)}." if fields else "Invalid request."
    return JSONResponse(status_code=422, content={"error": msg})


@app.exception_handler(Exception)
async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Something went wrong on our side. Please try again."},
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(DataUnavailableError)
async def _data_error(_: Request, exc: DataUnavailableError) -> JSONResponse:
    return JSONResponse(
        status_code=503, content={"error": "Market data is temporarily unavailable."}
    )


def _respond(response: Response, body: dict[str, Any], snap: Snapshot) -> dict[str, Any]:
    response.headers["Cache-Control"] = CACHE_HEADER
    body["as_of"] = snap.as_of
    body["engine_version"] = __version__
    out: dict[str, Any] = clean(body)
    return out


def _load(p: str, years: int) -> tuple[Snapshot, PortfolioData]:
    holdings = parse_portfolio(p)  # validate input before touching data
    snap = get_snapshot()
    data = prepare(snap, holdings, lookback_days=years * TRADING_DAYS)
    return snap, data


def _returns(snap: Snapshot, ticker: str) -> pd.Series:
    return snap.prices[ticker].dropna().pct_change().dropna()


def _portfolio_block(snap: Snapshot, data: PortfolioData) -> dict[str, Any]:
    info = snap.universe
    return {
        "holdings": [
            {"ticker": t, "weight": w, **info.get(t, {})}
            for t, w in zip(data.tickers, data.weights, strict=True)
        ],
        "data_quality": data.data_quality,
    }


def _timed(fn: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    t = time.perf_counter()
    body = fn()
    body["compute_seconds"] = time.perf_counter() - t
    return body


# ─── Metadata ───────────────────────────────────────────────────────────────────


@router.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, Any]:
    deps = [
        "fastapi",
        "numpy",
        "pandas",
        "scipy",
        "scikit-learn",
        "statsmodels",
        "hmmlearn",
        "arch",
    ]
    body: dict[str, Any] = {
        "status": "ok",
        "engine_version": __version__,
        "python": platform.python_version(),
        "dependencies": {name: version(name) for name in deps},
    }
    try:
        snap = get_snapshot()
        body["data"] = {"as_of": snap.as_of, "tickers": snap.prices.shape[1]}
    except DataUnavailableError:
        body["data"] = None
    return body


@router.get("/universe")
def universe(response: Response) -> dict[str, Any]:
    snap = get_snapshot()
    firsts = snap.prices.apply(lambda s: s.first_valid_index())
    rows = [
        {"ticker": t, **snap.universe.get(t, {}), "first_date": str(firsts[t].date())}
        for t in snap.prices.columns
        if firsts[t] is not None and not pd.isna(firsts[t])
    ]
    return _respond(
        response,
        {"tickers": rows, "factor_data_end": str(snap.factors.index[-1].date())},
        snap,
    )


@router.get("/demos")
def demos(response: Response) -> dict[str, Any]:
    snap = get_snapshot()
    return _respond(response, {"demos": [{**d, "p": spec(d)} for d in DEMOS]}, snap)


# ─── Sections ───────────────────────────────────────────────────────────────────


@router.get("/overview")
def overview(response: Response, p: PortfolioQuery, years: Years = 10) -> dict[str, Any]:
    snap, data = _load(p, years)

    def run() -> dict[str, Any]:
        bench = (
            pd.DataFrame({b: _returns(snap, b) for b in BENCHMARKS if b in snap.prices})
            .reindex(data.portfolio_returns.index)
            .fillna(0.0)
        )
        summary = metrics.summary(
            data.portfolio_returns, data.rf, data.weights, data.asset_returns, bench
        )
        r = data.portfolio_returns
        idx = list(range(0, len(r), 5)) + ([len(r) - 1] if (len(r) - 1) % 5 else [])
        growth = np.cumprod(1 + r.to_numpy())
        spy_growth = np.cumprod(1 + bench["SPY"].to_numpy()) if "SPY" in bench else None
        return {
            **_portfolio_block(snap, data),
            "metrics": summary,
            "growth": {
                "dates": [str(r.index[i].date()) for i in idx],
                "portfolio": growth[idx],
                "spy": spy_growth[idx] if spy_growth is not None else None,
                "drawdown": metrics.drawdown_series(r.to_numpy())[idx],
            },
            "correlation_matrix": {
                "tickers": data.tickers,
                "values": np.corrcoef(data.asset_returns.to_numpy(), rowvar=False)
                if len(data.tickers) > 1
                else [[1.0]],
            },
        }

    return _respond(response, _timed(run), snap)


@router.get("/risk")
def risk(response: Response, p: PortfolioQuery, years: Years = 10) -> dict[str, Any]:
    snap, data = _load(p, years)
    body = _timed(
        lambda: {
            **_portfolio_block(snap, data),
            **var.analyze(data.portfolio_returns, data.asset_returns, data.weights),
        }
    )
    return _respond(response, body, snap)


@router.get("/volatility")
def volatility(response: Response, p: PortfolioQuery, years: Years = 10) -> dict[str, Any]:
    snap, data = _load(p, years)
    body = _timed(
        lambda: {
            **_portfolio_block(snap, data),
            **garch.analyze(data.portfolio_returns, data.asset_returns, data.weights),
        }
    )
    return _respond(response, body, snap)


@router.get("/simulation")
def simulation(
    response: Response,
    p: PortfolioQuery,
    years: Years = 15,
    horizon: Annotated[int, Query(ge=21, le=1260)] = 252,
    paths: Annotated[int, Query(ge=500, le=10_000)] = 5000,
    block: Annotated[int, Query(ge=1, le=126)] = 21,
    mean: Literal["historical", "zero"] = "historical",
) -> dict[str, Any]:
    if paths * horizon > MAX_SIM_CELLS:
        raise PortfolioError(
            f"paths x horizon must be at most {MAX_SIM_CELLS:,}; reduce one of them."
        )
    snap, data = _load(p, years)
    body = _timed(
        lambda: {
            **_portfolio_block(snap, data),
            **montecarlo.simulate(
                data.portfolio_returns, horizon=horizon, n_paths=paths, block=block, mean_mode=mean
            ),
        }
    )
    return _respond(response, body, snap)


@router.get("/regimes")
def regimes(response: Response, p: PortfolioQuery, years: Years = 26) -> dict[str, Any]:
    snap, data = _load(p, years)
    body = _timed(
        lambda: {
            **_portfolio_block(snap, data),
            **regime.analyze(
                _returns(snap, "SPY"),
                data.portfolio_returns,
                precomputed=snap.meta.get("precomputed", {}).get("regimes"),
            ),
        }
    )
    return _respond(response, body, snap)


@router.get("/factors")
def factor_exposures(response: Response, p: PortfolioQuery, years: Years = 5) -> dict[str, Any]:
    snap, data = _load(p, years)
    try:
        body = _timed(
            lambda: {
                **_portfolio_block(snap, data),
                **factors.analyze(data.portfolio_returns, snap.factors),
            }
        )
    except ValueError as exc:
        raise PortfolioError(str(exc)) from exc
    return _respond(response, body, snap)


@router.get("/stress")
def stress_tests(
    response: Response,
    p: PortfolioQuery,
    years: Years = 5,
    market: Annotated[float, Query(ge=-0.6, le=0.3)] = -0.20,
    rates_bps: Annotated[float, Query(ge=-300, le=300)] = 100.0,
) -> dict[str, Any]:
    snap, data = _load(p, years)
    body = _timed(
        lambda: {
            **_portfolio_block(snap, data),
            **stress.analyze(
                snap.prices[data.tickers],
                snap.prices["SPY"],
                snap.prices["IEF"],
                data.weights,
                data.asset_returns,
                market_move=market,
                rate_change_bps=rates_bps,
            ),
        }
    )
    return _respond(response, body, snap)


@router.get("/compare")
def compare_portfolios(
    response: Response,
    a: Annotated[str, Query(max_length=400)],
    b: Annotated[str, Query(max_length=400)],
    years: Years = 10,
) -> dict[str, Any]:
    ha, hb = parse_portfolio(a), parse_portfolio(b)
    snap = get_snapshot()
    da = prepare(snap, ha, lookback_days=years * TRADING_DAYS)
    db = prepare(snap, hb, lookback_days=years * TRADING_DAYS)
    da, db = align(da, db)
    body = _timed(
        lambda: compare.analyze(
            da, db, snap.prices[da.tickers], snap.prices[db.tickers], snap.prices["SPY"]
        )
    )
    return _respond(response, body, snap)


# ─── Nonlinear Beta Tracker ─────────────────────────────────────────────────────

_BETA_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9\-]{0,9}$")
TickerQuery = Annotated[str, Query(min_length=1, max_length=12)]


def _beta_ticker(snap: Snapshot, raw: str, role: str) -> str:
    t = normalize_ticker(raw)
    if not _BETA_TICKER_RE.match(t):
        raise beta.BetaError(f"The {role} must be a ticker symbol, like NVDA or SPY.")
    if t not in snap.prices.columns:
        raise beta.BetaError(
            f"{t} is not in the data universe (S&P 500 stocks plus major ETFs). "
            "Pick a ticker from the list."
        )
    return t


@router.get("/beta")
def beta_tracker(
    response: Response,
    asset: TickerQuery = "NVDA",
    benchmark: TickerQuery = "SPY",
    lookback: Literal["6M", "1Y", "3Y", "5Y", "10Y", "max"] = "5Y",
    freq: Literal["daily", "weekly", "monthly"] = "daily",
    ret: Literal["log", "simple"] = "log",
    window: Annotated[int, Query(ge=10, le=504)] = 60,
    winsorize: bool = False,
) -> dict[str, Any]:
    """Linear and state-dependent beta of one asset against a benchmark (Nonlinear Beta Tracker)."""
    snap = get_snapshot()
    a = _beta_ticker(snap, asset, "asset")
    b = _beta_ticker(snap, benchmark, "benchmark")
    if a == b:
        raise beta.BetaError("Pick a benchmark that is different from the asset.")

    def run() -> dict[str, Any]:
        dates, ra, rb, info = beta.period_returns(
            snap.prices[a], snap.prices[b], frequency=freq, return_type=ret, lookback=lookback
        )
        result = beta.analyze(
            ra, rb, dates, frequency=freq, rolling_window=window, do_winsorize=winsorize
        )
        info_a = snap.universe.get(a, {})
        info_b = snap.universe.get(b, {})
        return {
            "asset": {"ticker": a, **info_a},
            "benchmark": {"ticker": b, **info_b},
            "data_quality": {
                **info,
                "price_basis": "adjusted closes (splits and dividends)",
                "risk_free": "none (raw returns, as in the original tracker)",
            },
            **result,
        }

    return _respond(response, _timed(run), snap)


# ─── Options pricing ────────────────────────────────────────────────────────────
# Pure functions of the query string: no market data, so no snapshot is needed
# (except to seed volatility from a ticker's history).

Spot = Annotated[float, Query(gt=0, le=1_000_000, description="Spot price of the underlying.")]
Strike = Annotated[float, Query(gt=0, le=1_000_000, description="Strike price.")]
Expiry = Annotated[float, Query(ge=0, le=30, description="Time to expiry in years.")]
Rate = Annotated[float, Query(ge=-0.1, le=0.5, description="Risk-free rate, continuous, decimal.")]
Yield = Annotated[float, Query(ge=-0.1, le=0.5, description="Dividend yield, continuous, decimal.")]
Vol = Annotated[float, Query(ge=0, le=5, description="Annual volatility, decimal.")]
Kind = Annotated[Literal["call", "put"], Query(alias="type")]
Seed = Annotated[int, Query(ge=0, le=2**31 - 1)]
OPTION_DP = 8


def _respond_options(response: Response, body: dict[str, Any]) -> dict[str, Any]:
    response.headers["Cache-Control"] = CACHE_HEADER
    body["engine_version"] = __version__
    body["disclaimer"] = "Educational model output under stated assumptions; not investment advice."
    out: dict[str, Any] = clean(body, dp=OPTION_DP)
    return out


def _inputs(
    s: float, k: float, t: float, r: float, q: float, sigma: float, kind: str
) -> dict[str, Any]:
    return {"s": s, "k": k, "t": t, "r": r, "q": q, "sigma": sigma, "type": kind}


@router.get("/options/price")
def option_price(
    response: Response,
    s: Spot = 100.0,
    k: Strike = 100.0,
    t: Expiry = 1.0,
    r: Rate = 0.04,
    q: Yield = 0.0,
    sigma: Vol = 0.2,
    kind: Kind = "call",
    steps: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> dict[str, Any]:
    """Black-Scholes-Merton price and Greeks, binomial European and American prices, curves."""

    def run() -> dict[str, Any]:
        args = (s, k, t, r, q, sigma)
        call = options.bs_price(*args, "call")
        put = options.bs_price(*args, "put")
        bs = call if kind == "call" else put
        eu_tree = options.binomial_price(*args, kind, steps, american=False)
        am_tree = options.binomial_price(*args, kind, steps, american=True)
        conv = options.binomial_convergence(*args, kind, max_steps=min(steps, 1000))
        return {
            "inputs": {**_inputs(*args, kind), "steps": steps},
            "black_scholes": {
                "price": bs,
                "call": call,
                "put": put,
                "parity_gap": options.parity_gap(s, k, t, r, q, call, put),
                "greeks": options.bs_greeks(*args, kind),
                "prob_itm": options.prob_in_the_money(*args, kind),
            },
            "intrinsic": options.intrinsic(s, k, kind),
            "time_value": bs - options.intrinsic(s, k, kind),
            "binomial": {
                "steps": steps,
                "european": eu_tree,
                "american": am_tree,
                # Measured on the same tree so discretization error cancels.
                "early_exercise_premium": max(am_tree - eu_tree, 0.0),
                "convergence": {**conv, "black_scholes": bs},
            },
            "curves": options.value_curves(*args, kind),
        }

    return _respond_options(response, _timed(run))


@router.get("/options/montecarlo")
def option_montecarlo(
    response: Response,
    s: Spot = 100.0,
    k: Strike = 100.0,
    t: Expiry = 1.0,
    r: Rate = 0.04,
    q: Yield = 0.0,
    sigma: Vol = 0.2,
    kind: Kind = "call",
    paths: Annotated[int, Query(ge=1000, le=200_000)] = 20_000,
    seed: Seed = 42,
) -> dict[str, Any]:
    """European price by Monte Carlo with antithetic variates and a control variate."""
    body = _timed(
        lambda: {
            "inputs": _inputs(s, k, t, r, q, sigma, kind),
            **options.mc_european(s, k, t, r, q, sigma, kind, n_paths=paths, seed=seed),
        }
    )
    return _respond_options(response, body)


@router.get("/options/asian")
def option_asian(
    response: Response,
    s: Spot = 100.0,
    k: Strike = 100.0,
    t: Expiry = 1.0,
    r: Rate = 0.04,
    q: Yield = 0.0,
    sigma: Vol = 0.2,
    kind: Kind = "call",
    obs: Annotated[int, Query(ge=1, le=1260, description="Averaging dates.")] = 52,
    paths: Annotated[int, Query(ge=1000, le=100_000)] = 20_000,
    seed: Seed = 42,
) -> dict[str, Any]:
    """Arithmetic-average Asian option by Monte Carlo (no closed form exists)."""
    if paths * obs > MAX_OPTION_CELLS:
        raise options.OptionsError(
            f"paths x averaging dates must be at most {MAX_OPTION_CELLS:,}; reduce one of them."
        )
    body = _timed(
        lambda: {
            "inputs": {**_inputs(s, k, t, r, q, sigma, kind), "obs": obs},
            **options.mc_asian(s, k, t, r, q, sigma, kind, n_obs=obs, n_paths=paths, seed=seed),
        }
    )
    return _respond_options(response, body)


BarrierKind = Annotated[
    Literal["up-and-out", "up-and-in", "down-and-out", "down-and-in"],
    Query(description="Barrier type."),
]


@router.get("/options/barrier")
def option_barrier(
    response: Response,
    h: Annotated[float, Query(gt=0, le=1_000_000, description="Barrier level.")],
    s: Spot = 100.0,
    k: Strike = 100.0,
    t: Expiry = 1.0,
    r: Rate = 0.04,
    q: Yield = 0.0,
    sigma: Vol = 0.2,
    kind: Kind = "call",
    btype: BarrierKind = "up-and-out",
    obs: Annotated[int, Query(ge=1, le=1260, description="Monitoring dates.")] = 52,
    paths: Annotated[int, Query(ge=1000, le=100_000)] = 20_000,
    seed: Seed = 42,
) -> dict[str, Any]:
    """Discretely monitored barrier option by Monte Carlo, with closed-form references."""
    if paths * obs > MAX_OPTION_CELLS:
        raise options.OptionsError(
            f"paths x monitoring dates must be at most {MAX_OPTION_CELLS:,}; reduce one of them."
        )
    body = _timed(
        lambda: {
            "inputs": {**_inputs(s, k, t, r, q, sigma, kind), "h": h, "btype": btype, "obs": obs},
            **options.mc_barrier(
                s, k, t, r, q, sigma, kind, h, btype, n_obs=obs, n_paths=paths, seed=seed
            ),
        }
    )
    return _respond_options(response, body)


@router.get("/options/implied-vol")
def option_implied_vol(
    response: Response,
    price: Annotated[float, Query(ge=0, le=1_000_000, description="Observed option price.")],
    s: Spot = 100.0,
    k: Strike = 100.0,
    t: Expiry = 1.0,
    r: Rate = 0.04,
    q: Yield = 0.0,
    kind: Kind = "call",
) -> dict[str, Any]:
    """Volatility implied by an observed European option price."""

    def run() -> dict[str, Any]:
        res = options.implied_vol(price, s, k, t, r, q, kind)
        top = max(1.5, min(5.0, res["sigma"] * 1.5))
        return {
            "inputs": {"price": price, "s": s, "k": k, "t": t, "r": r, "q": q, "type": kind},
            **res,
            "curve": options.price_vs_vol(s, k, t, r, q, kind, sigma_max=top, include=res["sigma"]),
        }

    return _respond_options(response, _timed(run))


@router.get("/options/historical-vol")
def option_historical_vol(
    response: Response,
    ticker: Annotated[str, Query(min_length=1, max_length=12, pattern=r"^[A-Za-z0-9.-]+$")],
) -> dict[str, Any]:
    """Realized volatility of a ticker from the nightly snapshot, to seed sigma."""
    sym = ticker.strip().upper()
    snap = get_snapshot()
    if sym not in snap.prices.columns:
        raise options.OptionsError(f"{sym} is not in the data set.")
    series = snap.prices[sym].dropna()
    closes = series.to_numpy(dtype=float)
    vols = {}
    for label, window in (("1m", 21), ("3m", 63), ("1y", 252)):
        vols[label] = options.realized_vol(closes, window) if len(closes) > window else None
    if vols["3m"] is None:
        raise options.OptionsError(f"{sym} has too little history for a 3-month volatility.")
    body = {
        "ticker": sym,
        "name": snap.universe.get(sym, {}).get("name"),
        "last_close": float(closes[-1]),
        "last_date": str(series.index[-1].date()),
        "realized_vol": vols,
        "note": "Annualized standard deviation of daily log returns of adjusted closes.",
    }
    return _respond(response, body, snap)


@router.get("/options/validation")
def option_validation(response: Response) -> dict[str, Any]:
    """Textbook checks and statistical validation, recomputed by the running engine."""
    return _respond_options(response, _timed(_validation_cached))


_VALIDATION: dict[str, Any] = {}


def _validation_cached() -> dict[str, Any]:
    if not _VALIDATION:
        _VALIDATION.update(options.validation_report())
    return {**_VALIDATION, "ticker_example": _ticker_example()}


def _ticker_example() -> dict[str, Any] | None:
    """Monte Carlo vs Black-Scholes for a three-month at-the-money NVDA call.

    Spot and volatility (one-year realized) come from the latest snapshot, so
    the numbers move with the data. None when the snapshot is unavailable.
    """
    try:
        snap = get_snapshot()
        series = snap.prices[options.EXAMPLE_TICKER].dropna()
    except Exception:  # noqa: BLE001 - the example is optional; validation must still load
        return None
    closes = series.to_numpy(dtype=float)
    if len(closes) <= 252:
        return None
    spot = float(closes[-1])
    sigma = options.realized_vol(closes, 252)
    body = options.mc_vs_black_scholes(
        spot, float(round(spot)), options.EXAMPLE_TERM, options.EXAMPLE_RATE, 0.0, sigma, "call"
    )
    return {
        "ticker": options.EXAMPLE_TICKER,
        "as_of": str(series.index[-1].date()),
        "vol_window": "1 year realized",
        **body,
    }


# ─── Transaction ML ─────────────────────────────────────────────────────────────
# A small classifier trained offline on synthetic transactions; the weights ship
# with the engine (models/transactions_model.json), so no data snapshot is needed.

Description = Annotated[
    str,
    Query(
        alias="d",
        min_length=1,
        max_length=transactions.MAX_DESCRIPTION,
        description="Statement descriptor, e.g. 'SQ *BLUE HERON COFFEE SAN DIEGO CA'.",
    ),
]
Amount = Annotated[
    float | None,
    Query(
        alias="a",
        ge=-transactions.MAX_AMOUNT,
        le=transactions.MAX_AMOUNT,
        description="Signed amount: negative for money out, positive for money in.",
    ),
]
TX_DISCLAIMER = (
    "Trained and evaluated on synthetic transactions; an educational model, "
    "not a financial product."
)


def _respond_tx(response: Response, body: dict[str, Any]) -> dict[str, Any]:
    response.headers["Cache-Control"] = CACHE_HEADER
    body["engine_version"] = __version__
    body["disclaimer"] = TX_DISCLAIMER
    out: dict[str, Any] = clean(body)
    return out


def _brief(result: dict[str, Any]) -> dict[str, Any]:
    """Compact per-row result for tables."""
    return {
        "normalized": result["input"]["normalized"],
        "prediction": result["prediction"],
        "top": result["top"],
        "why": result["explanation"]["for"][:3],
    }


def _parse_amounts(raw: list[str] | None, n: int) -> list[float | None]:
    if not raw:
        return [None] * n
    if len(raw) != n:
        raise transactions.TransactionsError(
            "Give one amount per description (leave an amount empty to skip it)."
        )
    out: list[float | None] = []
    for s in raw:
        s = s.strip()
        if not s:
            out.append(None)
            continue
        try:
            v = float(s.replace(",", "").replace("$", ""))
        except ValueError:
            raise transactions.TransactionsError(f"'{s[:20]}' is not a number.") from None
        if not np.isfinite(v) or abs(v) > transactions.MAX_AMOUNT:
            raise transactions.TransactionsError("Amounts must be finite and at most 1,000,000.")
        out.append(v)
    return out


@router.get("/transactions/categorize")
def transaction_categorize(
    response: Response,
    d: Description,
    a: Amount = None,
    k: Annotated[int, Query(ge=1, le=14, description="How many categories to return.")] = 3,
) -> dict[str, Any]:
    """Most likely categories for one descriptor, with calibrated probabilities and reasons."""
    model = transactions.load_model()
    return _respond_tx(response, _timed(lambda: transactions.categorize(model, d, a, k)))


@router.get("/transactions/batch")
def transaction_batch(
    response: Response,
    d: Annotated[
        list[str],
        Query(min_length=1, max_length=transactions.MAX_BATCH, description="Descriptors."),
    ],
    a: Annotated[
        list[str] | None,
        Query(max_length=transactions.MAX_BATCH, description="Amounts, one per descriptor."),
    ] = None,
) -> dict[str, Any]:
    """Categorize up to 25 descriptors; rows the model cannot read carry an error instead."""
    amounts = _parse_amounts(a, len(d))
    model = transactions.load_model()

    def run() -> dict[str, Any]:
        rows: list[dict[str, Any]] = []
        for desc, amt in zip(d, amounts, strict=True):
            try:
                rows.append({"amount": amt, **_brief(transactions.categorize(model, desc, amt))})
            except transactions.TransactionsError as exc:
                rows.append({"amount": amt, "error": str(exc)})
        return {"rows": rows}

    return _respond_tx(response, _timed(run))


@router.get("/transactions/metrics")
def transaction_metrics(response: Response) -> dict[str, Any]:
    """Held-out evaluation, baselines, calibration and the data behind them, as trained."""
    return _respond_tx(response, dict(_tx_metrics_cached()))


_TX_METRICS: dict[str, Any] = {}


def _tx_metrics_cached() -> dict[str, Any]:
    if not _TX_METRICS:
        model = transactions.load_model()
        meta = model.meta
        _TX_METRICS.update(
            {
                "categories": [
                    {"id": c, "label": lbl}
                    for c, lbl in zip(model.categories, model.labels, strict=True)
                ],
                "metrics": meta["metrics"],
                "dataset": meta["dataset"],
                "config": meta["config"],
                "top_features": transactions.top_features(model),
                "keyword_rules": [
                    {"category": c, "pattern": p} for c, p in transactions.KEYWORD_RULES
                ],
            }
        )
    return _TX_METRICS


@router.get("/transactions/examples")
def transaction_examples(response: Response) -> dict[str, Any]:
    """Descriptors to try, and held-out test transactions with the model's live predictions."""
    model = transactions.load_model()

    def run() -> dict[str, Any]:
        samples = []
        for s in model.meta.get("samples", []):
            res = transactions.categorize(model, s["description"], s["amount"])
            samples.append(
                {
                    **s,
                    "label": model.label_of(s["category"]),
                    **_brief(res),
                    "correct": res["prediction"]["category"] == s["category"],
                }
            )
        return {
            "presets": [
                {"description": dsc, "amount": amt, "note": note}
                for dsc, amt, note in transactions.PRESETS
            ],
            "samples": samples,
        }

    return _respond_tx(response, _timed(run))


app.include_router(router)
