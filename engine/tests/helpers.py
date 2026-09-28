"""Test helpers."""

from __future__ import annotations

import numpy as np


def garch_returns(
    n: int, rng: np.random.Generator, omega: float = 2e-6, alpha: float = 0.08, beta: float = 0.9
) -> np.ndarray:
    """Simulate GARCH(1,1) returns (decimal) with normal innovations."""
    r = np.empty(n)
    var = omega / (1 - alpha - beta)
    for t in range(n):
        r[t] = np.sqrt(var) * rng.standard_normal()
        var = omega + alpha * r[t] ** 2 + beta * var
    return r
