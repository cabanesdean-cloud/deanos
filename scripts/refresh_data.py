#!/usr/bin/env python3
"""Build the market data snapshot the engine reads.

Downloads adjusted daily closes for S&P 500 constituents and a list of major
ETFs from Yahoo Finance (via yfinance), plus the daily Fama-French five
factors and momentum from Kenneth French's data library, then writes one
compressed NumPy archive.

Run from the engine directory:

    uv run --extra data python ../scripts/refresh_data.py --out .data/snapshot.npz
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import time
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))

from deanos_engine._json import clean  # noqa: E402
from deanos_engine.data import Snapshot, load_snapshot, save_snapshot  # noqa: E402
from deanos_engine.models import regime  # noqa: E402
from deanos_engine.portfolio import normalize_ticker  # noqa: E402

START = "2000-01-01"
CONSTITUENTS_URL = (
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
)
FRENCH_BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
FRENCH_FILES = {
    "ff5": "F-F_Research_Data_5_Factors_2x3_daily_CSV.zip",
    "mom": "F-F_Momentum_Factor_daily_CSV.zip",
}
USER_AGENT = "deanos-data-refresh/1.0 (educational project)"

ETFS: dict[str, tuple[str, str]] = {
    # US equity
    "SPY": ("SPDR S&P 500 ETF", "US equity"),
    "VOO": ("Vanguard S&P 500 ETF", "US equity"),
    "VTI": ("Vanguard Total Stock Market ETF", "US equity"),
    "QQQ": ("Invesco QQQ (Nasdaq-100)", "US equity"),
    "DIA": ("SPDR Dow Jones Industrial Average ETF", "US equity"),
    "IWM": ("iShares Russell 2000 ETF", "US equity"),
    "IJH": ("iShares Core S&P Mid-Cap ETF", "US equity"),
    "IVW": ("iShares S&P 500 Growth ETF", "US equity"),
    "IVE": ("iShares S&P 500 Value ETF", "US equity"),
    "USMV": ("iShares MSCI USA Min Vol Factor ETF", "US equity"),
    "MTUM": ("iShares MSCI USA Momentum Factor ETF", "US equity"),
    "QUAL": ("iShares MSCI USA Quality Factor ETF", "US equity"),
    "SCHD": ("Schwab US Dividend Equity ETF", "US equity"),
    "VIG": ("Vanguard Dividend Appreciation ETF", "US equity"),
    "RSP": ("Invesco S&P 500 Equal Weight ETF", "US equity"),
    # Sectors
    "XLK": ("Technology Select Sector SPDR", "Sector"),
    "XLF": ("Financial Select Sector SPDR", "Sector"),
    "XLV": ("Health Care Select Sector SPDR", "Sector"),
    "XLE": ("Energy Select Sector SPDR", "Sector"),
    "XLI": ("Industrial Select Sector SPDR", "Sector"),
    "XLU": ("Utilities Select Sector SPDR", "Sector"),
    "XLP": ("Consumer Staples Select Sector SPDR", "Sector"),
    "XLY": ("Consumer Discretionary Select Sector SPDR", "Sector"),
    "XLB": ("Materials Select Sector SPDR", "Sector"),
    "XLRE": ("Real Estate Select Sector SPDR", "Sector"),
    "XLC": ("Communication Services Select Sector SPDR", "Sector"),
    # International equity
    "VEA": ("Vanguard FTSE Developed Markets ETF", "International equity"),
    "VWO": ("Vanguard FTSE Emerging Markets ETF", "International equity"),
    "EFA": ("iShares MSCI EAFE ETF", "International equity"),
    "EEM": ("iShares MSCI Emerging Markets ETF", "International equity"),
    "VXUS": ("Vanguard Total International Stock ETF", "International equity"),
    # Bonds
    "AGG": ("iShares Core US Aggregate Bond ETF", "Bonds"),
    "BND": ("Vanguard Total Bond Market ETF", "Bonds"),
    "SHY": ("iShares 1-3 Year Treasury Bond ETF", "Bonds"),
    "IEF": ("iShares 7-10 Year Treasury Bond ETF", "Bonds"),
    "TLT": ("iShares 20+ Year Treasury Bond ETF", "Bonds"),
    "TIP": ("iShares TIPS Bond ETF", "Bonds"),
    "LQD": ("iShares iBoxx Investment Grade Corporate Bond ETF", "Bonds"),
    "HYG": ("iShares iBoxx High Yield Corporate Bond ETF", "Bonds"),
    "BIL": ("SPDR Bloomberg 1-3 Month T-Bill ETF", "Bonds"),
    # Real assets
    "VNQ": ("Vanguard Real Estate ETF", "Real assets"),
    "GLD": ("SPDR Gold Shares", "Real assets"),
    "SLV": ("iShares Silver Trust", "Real assets"),
    "DBC": ("Invesco DB Commodity Index Tracking Fund", "Real assets"),
}
REQUIRED = ("SPY", "IEF", "QQQ", "AGG")


def fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data: bytes = resp.read()
        return data


def constituents() -> dict[str, tuple[str, str]]:
    text = fetch(CONSTITUENTS_URL).decode("utf-8")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        out[normalize_ticker(row["Symbol"])] = (row["Security"], row["GICS Sector"])
    if len(out) < 480:
        raise RuntimeError(f"constituent list looks wrong ({len(out)} rows)")
    return out


def download_prices(tickers: list[str], chunk: int = 80, retries: int = 3) -> pd.DataFrame:
    import yfinance as yf

    frames = []
    for i in range(0, len(tickers), chunk):
        batch = tickers[i : i + chunk]
        for attempt in range(retries):
            try:
                raw = yf.download(
                    batch,
                    start=START,
                    auto_adjust=True,
                    progress=False,
                    threads=True,
                    group_by="column",
                )
                close = raw["Close"]
                if isinstance(close, pd.Series):
                    close = close.to_frame(batch[0])
                frames.append(close)
                print(f"  prices {i + len(batch)}/{len(tickers)}", flush=True)
                break
            except Exception as exc:
                print(f"  batch {i} attempt {attempt + 1} failed: {exc}", flush=True)
                time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError(f"price download failed for batch starting {batch[0]}")
    prices = pd.concat(frames, axis=1)
    prices.index = pd.DatetimeIndex(prices.index).tz_localize(None).normalize()
    out: pd.DataFrame = prices.sort_index()
    return out


def _french_csv(name: str) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(fetch(FRENCH_BASE + name))) as z:
        text = z.read(z.namelist()[0]).decode("latin-1")
    lines = text.splitlines()
    # The first line starting with a comma is the column header (",Mkt-RF,SMB,..." or ",Mom").
    header_i = next(i for i, ln in enumerate(lines) if ln.strip().startswith(","))
    header = [h.strip() for h in lines[header_i].split(",")]
    rows: list[list[str]] = []
    for ln in lines[header_i + 1 :]:
        parts = [p.strip() for p in ln.split(",")]
        if len(parts) != len(header) or not parts[0].isdigit() or len(parts[0]) != 8:
            if rows:
                break
            continue
        rows.append(parts)
    df = pd.DataFrame(rows, columns=["date", *header[1:]])
    df.index = pd.to_datetime(df.pop("date"), format="%Y%m%d")
    out: pd.DataFrame = df.astype(float) / 100.0
    return out


def french_factors() -> pd.DataFrame:
    ff5 = _french_csv(FRENCH_FILES["ff5"])
    mom = _french_csv(FRENCH_FILES["mom"])
    mom.columns = ["Mom"]
    df = ff5.join(mom, how="inner")
    df = df[["Mkt-RF", "SMB", "HML", "RMW", "CMA", "Mom", "RF"]]
    return df.loc[START:]


def precompute(snap: Snapshot) -> Snapshot:
    """Add results that depend only on market data, so requests skip the slow fits."""
    print("Fitting market regime model...", flush=True)
    spy = snap.prices["SPY"].dropna().pct_change().dropna()
    payload = clean(regime.to_payload(regime.market_regimes(spy)))
    meta = {**snap.meta, "precomputed": {"regimes": payload}}
    st = payload["stability"]
    print(
        f"  regime {payload['current']['regime']}; next-best agreement "
        f"{st['agreement_next_best']:.2f}, calm/normal vs volatile/crisis "
        f"{st['low_vol_agreement_next_best']:.2f}",
        flush=True,
    )
    return Snapshot(prices=snap.prices, factors=snap.factors, meta=meta)


def build(out: Path) -> None:
    print("Fetching S&P 500 constituents...", flush=True)
    stocks = constituents()
    universe: dict[str, dict[str, str]] = {
        t: {"name": name, "sector": sector, "kind": "stock"} for t, (name, sector) in stocks.items()
    }
    for t, (name, group) in ETFS.items():
        universe[t] = {"name": name, "sector": group, "kind": "etf"}

    print(f"Downloading prices for {len(universe)} tickers...", flush=True)
    prices = download_prices(sorted(universe))
    prices = prices.dropna(axis=1, how="all")
    counts = prices.notna().sum()
    prices = prices.loc[:, counts >= 60]
    missing = sorted(set(universe) - set(prices.columns))
    if any(t not in prices for t in REQUIRED):
        raise RuntimeError(f"required tickers missing: {[t for t in REQUIRED if t not in prices]}")
    if len(missing) > 0.05 * len(universe):
        raise RuntimeError(f"too many tickers missing ({len(missing)})")
    # Keep only days SPY traded; drop a trailing partial day with mostly empty rows.
    prices = prices.loc[prices["SPY"].notna()]
    last_cov = prices.iloc[-1].notna().mean()
    if last_cov < 0.9:
        prices = prices.iloc[:-1]
    age = (pd.Timestamp.now().normalize() - prices.index[-1]).days
    if age > 7:
        raise RuntimeError(f"latest price date {prices.index[-1].date()} is {age} days old")

    print("Downloading Fama-French factors...", flush=True)
    factors = french_factors()

    meta = {
        "as_of": str(prices.index[-1].date()),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources": {
            "prices": "Yahoo Finance adjusted closes via yfinance",
            "constituents": CONSTITUENTS_URL,
            "factors": FRENCH_BASE,
        },
        "missing_tickers": missing,
        "universe": {t: universe[t] for t in prices.columns},
    }
    snap = precompute(Snapshot(prices=prices.astype(np.float64), factors=factors, meta=meta))
    save_snapshot(snap, out)
    size = out.stat().st_size / 1e6
    print(
        f"Wrote {out} ({size:.1f} MB): {prices.shape[1]} tickers, "
        f"{prices.index[0].date()} to {prices.index[-1].date()}; "
        f"factors to {factors.index[-1].date()}; missing {len(missing)}",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=Path("engine/.data/snapshot.npz"))
    parser.add_argument(
        "--precompute-only",
        action="store_true",
        help="Recompute derived results for an existing snapshot without downloading.",
    )
    args = parser.parse_args()
    if args.precompute_only:
        save_snapshot(precompute(load_snapshot(args.out)), args.out)
        print(f"Updated {args.out}", flush=True)
    else:
        build(args.out)


if __name__ == "__main__":
    main()
