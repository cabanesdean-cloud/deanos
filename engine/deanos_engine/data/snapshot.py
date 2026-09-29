"""Snapshot storage.

The nightly job writes one compressed NumPy archive (``.npz``) holding adjusted
daily closes, Fama-French factor returns and metadata. The engine keeps it in
memory. It is read from ``DEANOS_DATA_PATH``, or downloaded from
``DEANOS_DATA_URL`` at cold start.

A long-lived instance would otherwise keep serving the day it started with, so
a downloaded snapshot is re-checked once it is older than
``DEANOS_DATA_TTL_HOURS`` (default 6). The check is a conditional request
(ETag): usually a 304 with no body. If it fails, the current snapshot stays in
use and the check is retried later.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

FORMAT_VERSION = 1
DEFAULT_LOCAL_PATH = Path(__file__).resolve().parents[2] / ".data" / "snapshot.npz"


class DataUnavailableError(RuntimeError):
    """The market data snapshot could not be loaded."""


@dataclass(frozen=True)
class Snapshot:
    prices: pd.DataFrame
    """Adjusted closes. DatetimeIndex (trading days) x ticker columns; NaN before listing."""

    factors: pd.DataFrame
    """Daily factor returns as decimals: Mkt-RF, SMB, HML, RMW, CMA, Mom, RF."""

    meta: dict[str, Any] = field(default_factory=dict)
    """as_of, generated_at, sources and per-ticker info ({ticker: {name, sector, kind}})."""

    @property
    def as_of(self) -> str:
        return str(self.prices.index[-1].date())

    @property
    def universe(self) -> dict[str, dict[str, Any]]:
        info: dict[str, dict[str, Any]] = self.meta.get("universe", {})
        return info


def save_snapshot(snapshot: Snapshot, path: Path) -> None:
    prices = snapshot.prices
    factors = snapshot.factors
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        path,
        format_version=np.array(FORMAT_VERSION),
        price_dates=prices.index.values.astype("datetime64[D]"),
        tickers=np.array(prices.columns, dtype=str),
        closes=prices.to_numpy(dtype=np.float32),
        factor_dates=factors.index.values.astype("datetime64[D]"),
        factor_names=np.array(factors.columns, dtype=str),
        factor_values=factors.to_numpy(dtype=np.float64),
        meta_json=np.array(json.dumps(snapshot.meta)),
    )


def load_snapshot(path: Path) -> Snapshot:
    with np.load(path, allow_pickle=False) as z:
        version = int(z["format_version"])
        if version != FORMAT_VERSION:
            raise DataUnavailableError(f"snapshot format {version}, expected {FORMAT_VERSION}")
        prices = pd.DataFrame(
            z["closes"].astype(np.float64),
            index=pd.DatetimeIndex(z["price_dates"].astype("datetime64[ns]")),
            columns=[str(t) for t in z["tickers"]],
        )
        factors = pd.DataFrame(
            z["factor_values"],
            index=pd.DatetimeIndex(z["factor_dates"].astype("datetime64[ns]")),
            columns=[str(n) for n in z["factor_names"]],
        )
        meta = json.loads(str(z["meta_json"]))
    return Snapshot(prices=prices, factors=factors, meta=meta)


_lock = threading.Lock()
_cached: Snapshot | None = None
_etag: str | None = None
_checked_at = 0.0  # time.monotonic() of the last successful load or freshness check
_retry_after = 0.0

RETRY_SECONDS = 15 * 60


def _now() -> float:
    return time.monotonic()


def set_snapshot(snapshot: Snapshot | None) -> None:
    """Replace the process-wide snapshot (tests and local tooling)."""
    global _cached, _etag, _checked_at, _retry_after
    with _lock:
        _cached = snapshot
        _etag = None
        _checked_at = _now()
        _retry_after = 0.0


def _ttl_seconds() -> float:
    try:
        return float(os.environ.get("DEANOS_DATA_TTL_HOURS", "6")) * 3600
    except ValueError:
        return 6 * 3600


def _download(url: str, etag: str | None) -> tuple[Path | None, str | None]:
    """Fetch ``url`` unless it still matches ``etag``.

    Returns (path, etag) for new content, or (None, etag) when unchanged.
    """
    headers = {"If-None-Match": etag} if etag else {}
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return None, etag
        raise
    with resp:
        fd, name = tempfile.mkstemp(prefix="deanos-snapshot-", suffix=".npz")
        with os.fdopen(fd, "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
        return Path(name), resp.headers.get("ETag")


def _load_from_url(url: str, etag: str | None) -> tuple[Snapshot | None, str | None]:
    path, new_etag = _download(url, etag)
    if path is None:
        return None, new_etag
    try:
        return load_snapshot(path), new_etag
    finally:
        path.unlink(missing_ok=True)


def _refresh_if_stale(url: str) -> None:
    """Swap in a newer snapshot if the published one changed. Never raises."""
    global _cached, _etag, _checked_at, _retry_after
    now = _now()
    if now - _checked_at < _ttl_seconds() or now < _retry_after:
        return
    with _lock:
        if _now() - _checked_at < _ttl_seconds():
            return
        try:
            snap, etag = _load_from_url(url, _etag)
        except Exception:
            _retry_after = _now() + RETRY_SECONDS
            return
        if snap is not None:
            _cached = snap
        _etag = etag
        _checked_at = _now()


def get_snapshot() -> Snapshot:
    """The current snapshot, loaded on first use and refreshed when stale (URL only)."""
    global _cached, _etag, _checked_at
    url = None if os.environ.get("DEANOS_DATA_PATH") else os.environ.get("DEANOS_DATA_URL")
    if _cached is not None:
        if url:
            _refresh_if_stale(url)
        return _cached
    with _lock:
        if _cached is None:
            try:
                explicit = os.environ.get("DEANOS_DATA_PATH")
                if explicit:
                    _cached = load_snapshot(Path(explicit))
                elif url:
                    snap, _etag = _load_from_url(url, None)
                    assert snap is not None
                    _cached = snap
                else:
                    _cached = load_snapshot(DEFAULT_LOCAL_PATH)
                _checked_at = _now()
            except DataUnavailableError:
                raise
            except Exception as exc:  # network, missing file, corrupt archive
                raise DataUnavailableError(f"market data snapshot unavailable: {exc}") from exc
        return _cached
