"""Portfolio parsing and return preparation.

Portfolios are lists of (ticker, weight). They arrive in the URL as
``SPY:40,AGG:60`` and are never stored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, cast

import numpy as np
import numpy.typing as npt
import pandas as pd

from deanos_engine.data import Snapshot

MAX_HOLDINGS = 25
MIN_HISTORY_DAYS = 252
MAX_FILL_DAYS = 5
TRADING_DAYS = 252

_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9\-]{0,9}$")

FloatArray = npt.NDArray[np.float64]


class PortfolioError(ValueError):
    """The portfolio specification or its data is invalid. Message is user-facing."""


@dataclass(frozen=True)
class Holding:
    ticker: str
    weight: float


def _show(raw: str) -> str:
    """User input as it may appear in an error message: ticker characters only, truncated."""
    safe = re.sub(r"[^A-Za-z0-9.\- ]", "", raw).strip()[:12]
    return safe or "That entry"


def normalize_ticker(raw: str) -> str:
    # Yahoo-style class shares: BRK.B -> BRK-B.
    return raw.strip().upper().replace(".", "-").replace("/", "-")


def parse_portfolio(spec: str) -> list[Holding]:
    """Parse ``"SPY:40,AGG:60"`` into holdings with weights summing to 1.

    Weights are relative: ``SPY:2,AGG:3`` equals ``SPY:40,AGG:60``.
    """
    if not spec or not spec.strip():
        raise PortfolioError("Portfolio is empty.")
    raw: dict[str, float] = {}
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            raise PortfolioError(f"'{_show(part)}' needs a weight, like {_show(part).upper()}:10.")
        t_raw, w_raw = part.split(":", 1)
        ticker = normalize_ticker(t_raw)
        if not _TICKER_RE.match(ticker):
            raise PortfolioError(f"'{_show(t_raw)}' is not a valid ticker.")
        try:
            weight = float(w_raw)
        except ValueError as exc:
            raise PortfolioError(f"Weight for {ticker} is not a number.") from exc
        if not np.isfinite(weight) or weight <= 0:
            raise PortfolioError(f"Weight for {ticker} must be positive.")
        if ticker in raw:
            raise PortfolioError(f"{ticker} appears more than once.")
        raw[ticker] = weight
    if not raw:
        raise PortfolioError("Portfolio is empty.")
    if len(raw) > MAX_HOLDINGS:
        raise PortfolioError(f"Use at most {MAX_HOLDINGS} holdings.")
    total = sum(raw.values())
    return [Holding(t, w / total) for t, w in raw.items()]


def format_portfolio(holdings: list[Holding]) -> str:
    return ",".join(f"{h.ticker}:{round(h.weight * 100, 4):g}" for h in holdings)


@dataclass(frozen=True)
class PortfolioData:
    """Aligned daily returns for one portfolio over a common window."""

    tickers: list[str]
    weights: FloatArray
    asset_returns: pd.DataFrame
    """Simple daily returns, dates x tickers, no NaN."""

    portfolio_returns: pd.Series
    """Daily returns of the portfolio rebalanced to target weights every day."""

    rf: pd.Series
    """Daily risk-free rate aligned to the window (0 where factor data has ended)."""

    data_quality: dict[str, Any] = field(default_factory=dict)


def _first_valid(prices: pd.DataFrame) -> dict[str, pd.Timestamp | None]:
    out: dict[str, pd.Timestamp | None] = {}
    for c in prices.columns:
        first = prices[c].first_valid_index()
        out[str(c)] = pd.Timestamp(cast(Any, first)) if first is not None else None
    return out


def prepare(
    snapshot: Snapshot,
    holdings: list[Holding],
    lookback_days: int = 10 * TRADING_DAYS,
    min_days: int = MIN_HISTORY_DAYS,
    end: pd.Timestamp | None = None,
) -> PortfolioData:
    """Build aligned returns for ``holdings`` over the most recent ``lookback_days``.

    The window starts at the later of (end - lookback) and the date every
    holding has prices. Gaps of up to five trading days (halts, holidays on
    foreign listings) are forward-filled and disclosed.
    """
    universe = snapshot.prices.columns
    unknown = [h.ticker for h in holdings if h.ticker not in universe]
    if unknown:
        raise PortfolioError(
            f"Not in the data universe: {', '.join(unknown)}. "
            "The universe is S&P 500 stocks plus major ETFs."
        )
    tickers = [h.ticker for h in holdings]
    weights = np.array([h.weight for h in holdings], dtype=np.float64)

    prices = snapshot.prices[tickers]
    if end is not None:
        prices = prices.loc[:end]
    firsts = _first_valid(prices)
    missing = [t for t, d in firsts.items() if d is None]
    if missing:
        raise PortfolioError(f"No price history for {', '.join(missing)}.")

    listed = {t: d for t, d in firsts.items() if d is not None}
    requested_start_pos = max(0, len(prices) - lookback_days - 1)
    requested_start = prices.index[requested_start_pos]
    latest_listing = max(listed.values())
    limited_by = [t for t, d in listed.items() if d == latest_listing and d > requested_start]
    start = max(requested_start, latest_listing)

    window = prices.loc[start:]
    filled_mask = window.isna()
    window = window.ffill(limit=MAX_FILL_DAYS)
    filled = int((filled_mask & window.notna()).to_numpy().sum())
    returns = window.pct_change().iloc[1:]
    before = len(returns)
    returns = returns.dropna(how="any")
    dropped = before - len(returns)

    if len(returns) < min_days:
        short = ", ".join(limited_by) if limited_by else "the portfolio"
        raise PortfolioError(
            f"Only {len(returns)} trading days of shared history ({short}). "
            f"At least {min_days} are needed."
        )

    port = pd.Series(returns.to_numpy() @ weights, index=returns.index, name="portfolio")
    rf = (
        snapshot.factors["RF"].reindex(returns.index).fillna(0.0)
        if "RF" in snapshot.factors
        else pd.Series(0.0, index=returns.index)
    )

    quality: dict[str, Any] = {
        "start": str(returns.index[0].date()),
        "end": str(returns.index[-1].date()),
        "trading_days": len(returns),
        "requested_lookback_days": lookback_days,
        "limited_by": limited_by,
        "filled_prices": filled,
        "dropped_days": dropped,
        "rebalancing": "daily, to target weights",
        "price_basis": "adjusted closes (dividends and splits reinvested)",
    }
    return PortfolioData(
        tickers=tickers,
        weights=weights,
        asset_returns=returns,
        portfolio_returns=port,
        rf=rf,
        data_quality=quality,
    )


def align(a: PortfolioData, b: PortfolioData) -> tuple[PortfolioData, PortfolioData]:
    """Restrict two portfolios to their common dates so comparisons are like-for-like."""
    common = a.asset_returns.index.intersection(b.asset_returns.index)

    def cut(p: PortfolioData) -> PortfolioData:
        ar = p.asset_returns.loc[common]
        q = dict(p.data_quality)
        q.update(start=str(common[0].date()), end=str(common[-1].date()), trading_days=len(common))
        return PortfolioData(
            tickers=p.tickers,
            weights=p.weights,
            asset_returns=ar,
            portfolio_returns=p.portfolio_returns.loc[common],
            rf=p.rf.loc[common],
            data_quality=q,
        )

    return cut(a), cut(b)
