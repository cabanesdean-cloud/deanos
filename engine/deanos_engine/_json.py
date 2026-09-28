"""Convert model output to JSON-safe Python values."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def clean(obj: Any, dp: int = 6) -> Any:
    """Recursively convert NumPy/pandas values; NaN and inf become None."""
    if isinstance(obj, dict):
        return {str(k): clean(v, dp) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v, dp) for v in obj]
    if isinstance(obj, np.ndarray):
        return [clean(v, dp) for v in obj.tolist()]
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return round(f, dp) if math.isfinite(f) else None
    if isinstance(obj, pd.Timestamp):
        return str(obj.date())
    return obj
