"""Block bootstrap index generation shared by Monte Carlo and metric intervals."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt


def circular_block_indices(
    n_obs: int,
    length: int,
    n_samples: int,
    block: int,
    rng: np.random.Generator,
) -> npt.NDArray[np.int64]:
    """Indices for a circular moving-block bootstrap.

    Each sample is built from consecutive runs of ``block`` observations with
    random starting points, wrapping past the end. Keeping runs together
    preserves short-range dependence such as volatility clustering, which an
    i.i.d. day-by-day bootstrap destroys.
    """
    if n_obs < 1 or length < 1 or n_samples < 1:
        raise ValueError("n_obs, length and n_samples must be positive")
    block = max(1, min(block, n_obs))
    n_blocks = -(-length // block)
    starts = rng.integers(0, n_obs, size=(n_samples, n_blocks))
    offsets = np.arange(block)
    idx = (starts[:, :, None] + offsets[None, None, :]) % n_obs
    return idx.reshape(n_samples, n_blocks * block)[:, :length].astype(np.int64)
