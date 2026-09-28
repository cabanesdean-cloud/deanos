import numpy as np
import pandas as pd
import pytest

from deanos_engine.data import Snapshot, load_snapshot, save_snapshot
from deanos_engine.portfolio import (
    PortfolioError,
    align,
    format_portfolio,
    parse_portfolio,
    prepare,
)


def test_parse_normalizes_weights() -> None:
    h = parse_portfolio("spy:2, agg:3")
    assert [x.ticker for x in h] == ["SPY", "AGG"]
    assert [x.weight for x in h] == pytest.approx([0.4, 0.6])
    assert format_portfolio(h) == "SPY:40,AGG:60"


def test_parse_share_class_ticker() -> None:
    assert parse_portfolio("BRK.B:1")[0].ticker == "BRK-B"


@pytest.mark.parametrize(
    ("spec", "message"),
    [
        ("", "empty"),
        ("SPY", "needs a weight"),
        ("SPY:-1", "positive"),
        ("SPY:0", "positive"),
        ("SPY:abc", "not a number"),
        ("SPY:nan", "positive"),
        ("SPY:1,SPY:2", "more than once"),
        ("$$$:1", "not a valid ticker"),
        (",".join(f"T{i}:1" for i in range(26)), "at most 25"),
    ],
)
def test_parse_rejects(spec: str, message: str) -> None:
    with pytest.raises(PortfolioError, match=message):
        parse_portfolio(spec)


def test_prepare_weighted_returns(snapshot: Snapshot) -> None:
    d = prepare(snapshot, parse_portfolio("SPY:60,AGG:40"), lookback_days=1000)
    assert len(d.asset_returns) == 1000
    expected = 0.6 * d.asset_returns["SPY"] + 0.4 * d.asset_returns["AGG"]
    np.testing.assert_allclose(d.portfolio_returns, expected)
    assert d.data_quality["limited_by"] == []
    assert not d.asset_returns.isna().any().any()


def test_prepare_reports_limiting_ticker(snapshot: Snapshot) -> None:
    d = prepare(snapshot, parse_portfolio("SPY:50,BBB:50"), lookback_days=20 * 252)
    assert d.data_quality["limited_by"] == ["BBB"]
    assert d.data_quality["start"] >= "2015-01-01"


def test_prepare_rejects_short_history(snapshot: Snapshot) -> None:
    with pytest.raises(PortfolioError, match="trading days of shared history"):
        prepare(snapshot, parse_portfolio("SPY:50,CCC:50"))


def test_prepare_rejects_unknown(snapshot: Snapshot) -> None:
    with pytest.raises(PortfolioError, match="Not in the data universe: ZZZZ"):
        prepare(snapshot, parse_portfolio("SPY:50,ZZZZ:50"))


def test_prepare_fills_short_gaps(snapshot: Snapshot) -> None:
    prices = snapshot.prices.copy()
    prices.loc[prices.index[-10:-8], "AAA"] = np.nan
    snap = Snapshot(prices=prices, factors=snapshot.factors, meta=snapshot.meta)
    d = prepare(snap, parse_portfolio("AAA:1"), lookback_days=300)
    assert d.data_quality["filled_prices"] == 2
    assert d.data_quality["dropped_days"] == 0


def test_align(snapshot: Snapshot) -> None:
    a = prepare(snapshot, parse_portfolio("SPY:1"), lookback_days=3000)
    b = prepare(snapshot, parse_portfolio("SPY:1,BBB:1"), lookback_days=6000)
    a2, b2 = align(a, b)
    assert a2.asset_returns.index.equals(b2.asset_returns.index)
    assert a2.data_quality["trading_days"] == len(a2.portfolio_returns)


def test_snapshot_round_trip(snapshot: Snapshot, tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "s.npz"
    save_snapshot(snapshot, path)
    loaded = load_snapshot(path)
    assert list(loaded.prices.columns) == list(snapshot.prices.columns)
    assert (loaded.prices.index == snapshot.prices.index).all()
    # Prices are stored as float32; timestamp resolution may differ (ns vs us).
    pd.testing.assert_frame_equal(
        loaded.prices, snapshot.prices, rtol=1e-6, check_index_type=False, check_freq=False
    )
    pd.testing.assert_frame_equal(
        loaded.factors, snapshot.factors, check_index_type=False, check_freq=False
    )
    assert loaded.meta == snapshot.meta
