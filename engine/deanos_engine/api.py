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
from deanos_engine.models import compare, factors, garch, metrics, montecarlo, regime, stress, var
from deanos_engine.portfolio import (
    TRADING_DAYS,
    PortfolioData,
    PortfolioError,
    align,
    parse_portfolio,
    prepare,
)

API_PREFIX = "/deanos/api"
CACHE_HEADER = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
BENCHMARKS = ("SPY", "QQQ", "AGG")
# paths x horizon bound: each simulated day is ~8 bytes in several working arrays.
MAX_SIM_CELLS = 5_000_000

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


app.include_router(router)
