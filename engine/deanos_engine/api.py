"""FastAPI app served by Vercel under the /deanos/api prefix.

Vercel Services passes the original request path through to the service, so
routes are mounted under the full public prefix.
"""

import platform
import time
from importlib.metadata import version
from typing import Any

from fastapi import APIRouter, FastAPI

from deanos_engine import __version__

API_PREFIX = "/deanos/api"

# Every heavy dependency the models need. Importing them here at module load
# means /health reports the real cold-start cost of the full engine.
_t0 = time.perf_counter()
import arch  # noqa: E402,F401
import hmmlearn  # noqa: E402,F401
import numpy as np  # noqa: E402
import pandas  # noqa: E402,F401
import scipy  # noqa: E402,F401
import sklearn  # noqa: E402,F401
import statsmodels  # noqa: E402,F401

IMPORT_SECONDS = round(time.perf_counter() - _t0, 3)

_DEPENDENCIES = [
    "fastapi",
    "numpy",
    "pandas",
    "scipy",
    "scikit-learn",
    "statsmodels",
    "hmmlearn",
    "arch",
]

app = FastAPI(
    title="DeanOS engine",
    version=__version__,
    docs_url=f"{API_PREFIX}/docs",
    openapi_url=f"{API_PREFIX}/openapi.json",
    redoc_url=None,
)
router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine_version": __version__,
        "python": platform.python_version(),
        "machine": platform.machine(),
        "import_seconds": IMPORT_SECONDS,
        "dependencies": {name: version(name) for name in _DEPENDENCIES},
    }


@router.get("/spike")
def spike() -> dict[str, Any]:
    """Phase 5 deployment spike: time one small fit from each heavy library.

    Synthetic data only. Removed once the real models land.
    """
    from arch import arch_model
    from hmmlearn.hmm import GaussianHMM
    from sklearn.mixture import GaussianMixture
    from statsmodels.regression.linear_model import OLS

    rng = np.random.default_rng(0)
    returns = rng.standard_t(df=5, size=2_000) * 0.01
    timings: dict[str, float] = {}

    t = time.perf_counter()
    arch_model(returns * 100, vol="GARCH", p=1, q=1).fit(disp="off")
    timings["garch_fit"] = time.perf_counter() - t

    t = time.perf_counter()
    GaussianHMM(n_components=2, n_iter=100, random_state=0).fit(returns.reshape(-1, 1))
    timings["hmm_fit"] = time.perf_counter() - t

    t = time.perf_counter()
    GaussianMixture(n_components=2, random_state=0).fit(returns.reshape(-1, 1))
    timings["gmm_fit"] = time.perf_counter() - t

    t = time.perf_counter()
    x = rng.normal(size=(2_000, 6))
    OLS(returns, np.column_stack([np.ones(2_000), x])).fit(cov_type="HAC", cov_kwds={"maxlags": 5})
    timings["ols_hac_fit"] = time.perf_counter() - t

    t = time.perf_counter()
    idx = rng.integers(0, 2_000, size=(5_000, 252))
    np.cumprod(1 + returns[idx], axis=1)
    timings["bootstrap_5000x252"] = time.perf_counter() - t

    return {"seconds": {k: round(v, 4) for k, v in timings.items()}}


app.include_router(router)
