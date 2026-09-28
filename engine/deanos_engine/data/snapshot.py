"""Snapshot storage.

The nightly job writes one compressed NumPy archive (``.npz``) holding adjusted
daily closes, Fama-French factor returns and metadata. The engine loads it once
per process. Nothing here touches the network on a page request: the archive is
read from ``DEANOS_DATA_PATH`` or downloaded once from ``DEANOS_DATA_URL`` at
cold start.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
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


def set_snapshot(snapshot: Snapshot | None) -> None:
    """Replace the process-wide snapshot (tests and local tooling)."""
    global _cached
    with _lock:
        _cached = snapshot


def _resolve_path() -> Path:
    explicit = os.environ.get("DEANOS_DATA_PATH")
    if explicit:
        return Path(explicit)
    url = os.environ.get("DEANOS_DATA_URL")
    if url:
        target = Path(tempfile.gettempdir()) / "deanos-snapshot.npz"
        if not target.exists():
            partial = target.with_suffix(".part")
            with urllib.request.urlopen(url, timeout=60) as resp, partial.open("wb") as out:
                while chunk := resp.read(1 << 20):
                    out.write(chunk)
            partial.replace(target)
        return target
    return DEFAULT_LOCAL_PATH


def get_snapshot() -> Snapshot:
    """Load the snapshot once per process."""
    global _cached
    if _cached is not None:
        return _cached
    with _lock:
        if _cached is None:
            try:
                path = _resolve_path()
                _cached = load_snapshot(path)
            except DataUnavailableError:
                raise
            except Exception as exc:  # network, missing file, corrupt archive
                raise DataUnavailableError(f"market data snapshot unavailable: {exc}") from exc
        return _cached
