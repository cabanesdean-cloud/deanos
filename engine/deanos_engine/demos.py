"""Example portfolios shown to visitors.

Built from broad, widely held funds and large companies so they read as
illustrations. They are not recommendations.
"""

from __future__ import annotations

from typing import TypedDict


class Demo(TypedDict):
    id: str
    name: str
    description: str
    holdings: dict[str, float]


DEMOS: list[Demo] = [
    {
        "id": "balanced",
        "name": "Balanced",
        "description": "A 60/40-style mix of US and international stocks with bonds, "
        "real estate and gold.",
        "holdings": {"VTI": 35, "VEA": 15, "VWO": 5, "AGG": 25, "TIP": 5, "VNQ": 5, "GLD": 10},
    },
    {
        "id": "growth",
        "name": "Concentrated Growth",
        "description": "A stock-heavy portfolio built around the Nasdaq-100 and a few "
        "large consumer and internet companies.",
        "holdings": {"QQQ": 40, "AMZN": 12, "GOOGL": 12, "COST": 12, "V": 12, "NFLX": 12},
    },
    {
        "id": "defensive",
        "name": "Defensive",
        "description": "Low-volatility stocks, consumer staples and utilities with "
        "Treasuries and gold.",
        "holdings": {"USMV": 30, "XLP": 15, "XLU": 10, "IEF": 25, "SHY": 10, "GLD": 10},
    },
]


def spec(demo: Demo) -> str:
    return ",".join(f"{t}:{w}" for t, w in demo["holdings"].items())
