"""Market regime detection on SPY with a four-state Gaussian hidden Markov model.

Features per day, from SPY daily returns: 20-day mean return, 20-day
volatility and 60-day mean return. (The private model also included the
20-day volatility annualized, an exact multiple of the 20-day volatility,
which makes the full covariance matrices singular. It is dropped.)

Changes from the private model:

- History is labeled with filtered probabilities P(state_t | features_1..t),
  computed by the forward algorithm. The private model used the Viterbi path
  and smoothed probabilities, which use future data: a day's label could
  change after later days arrived. Model parameters are still estimated on the
  full sample, which is disclosed.
- The model is fitted from several random starting points and the fit with
  the highest likelihood is kept. The private model used one fixed seed,
  which on current data lands in a clearly worse local optimum. Agreement
  between the best fits is reported as a stability check.

- States are named by volatility rank (calm, normal, volatile, crisis). The
  private model named them bull, bear, recovery and crisis from each state's
  average same-day return. On this data every non-crisis state has a positive
  average return, so "bear" meant "the lowest of three positive returns" and
  flipped between near-identical fits. The fitted states differ mainly in
  volatility; the names now say so, and each state's return is reported.

Kept: four states; the 95% cap on the reported confidence with the excess
redistributed (applied to the current reading and to every history date);
the Gaussian mixture fallback if the HMM fails.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.special import logsumexp
from scipy.stats import multivariate_normal

TRADING_DAYS = 252
N_STATES = 4
CONFIDENCE_CAP = 0.95
DEFAULT_STARTS = 8
LABELS = ("calm", "normal", "volatile", "crisis")
FloatArray = npt.NDArray[np.float64]

logging.getLogger("hmmlearn").setLevel(logging.ERROR)


def features(spy_returns: pd.Series) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "ret20": spy_returns.rolling(20).mean(),
            "vol20": spy_returns.rolling(20).std(ddof=1),
            "ret60": spy_returns.rolling(60).mean(),
        }
    ).dropna()


def cap_confidence(probs: FloatArray, cap: float = CONFIDENCE_CAP) -> FloatArray:
    """Cap the largest probability at ``cap`` and spread the excess over the others.

    Spreading is proportional to the other states' probabilities, or equal if
    they are all zero. Clipping and renormalizing would snap back to 1.0 when
    the other states are near zero.
    """
    p = np.asarray(probs, dtype=np.float64).copy()
    if p.size < 2 or p.max() <= cap:
        return p / p.sum()
    i = int(p.argmax())
    excess = p[i] - cap
    p[i] = cap
    others = np.arange(p.size) != i
    other_sum = float(p[others].sum())
    if other_sum > 0:
        p[others] += excess * p[others] / other_sum
    else:
        p[others] += excess / (p.size - 1)
    return p / p.sum()


def cap_history(history: dict[str, Any], cap: float = CONFIDENCE_CAP) -> dict[str, Any]:
    """Apply ``cap_confidence`` to every history date, as for the current reading.

    Idempotent, so it is safe on a precomputed payload that was already capped.
    """
    rows = np.column_stack([np.asarray(history[lab], dtype=np.float64) for lab in LABELS])
    capped = np.vstack([cap_confidence(row, cap) for row in rows]) if len(rows) else rows
    out = dict(history)
    for j, lab in enumerate(LABELS):
        out[lab] = [float(v) for v in capped[:, j]]
    out["confidence_cap"] = cap
    return out


def forward_filter(
    log_emission: FloatArray, startprob: FloatArray, transmat: FloatArray
) -> FloatArray:
    """Filtered state probabilities P(s_t | x_1..t) by the forward algorithm (log space)."""
    t_len, k = log_emission.shape
    log_a = np.log(np.clip(transmat, 1e-300, None))
    out = np.empty((t_len, k))
    alpha = np.log(np.clip(startprob, 1e-300, None)) + log_emission[0]
    alpha -= logsumexp(alpha)
    out[0] = alpha
    for t in range(1, t_len):
        alpha = logsumexp(alpha[:, None] + log_a, axis=0) + log_emission[t]
        alpha -= logsumexp(alpha)
        out[t] = alpha
    return np.asarray(np.exp(out), dtype=np.float64)


def label_states(state_seq: npt.NDArray[np.int64], vol20: FloatArray) -> dict[int, str]:
    """Name states by the average 20-day volatility on the days each is most likely.

    Ordering by the model's own volatility feature does not depend on which
    random start produced the fit, so the same fitted states always get the
    same names. A state that is never the most likely sorts by its absence
    (zero), which only happens in degenerate fits.
    """
    means = [
        float(vol20[state_seq == s].mean()) if np.any(state_seq == s) else 0.0
        for s in range(N_STATES)
    ]
    order = np.argsort(means, kind="stable")
    return {int(s): LABELS[rank] for rank, s in enumerate(order)}


@dataclass(frozen=True)
class RegimeFit:
    model: str
    seed: int
    log_likelihood: float
    filtered: FloatArray
    """T x K filtered probabilities, columns in state order."""
    names: dict[int, str]
    transmat: FloatArray
    converged: bool


def fit(feat: pd.DataFrame, spy_returns: FloatArray, seed: int) -> RegimeFit:
    x = feat.to_numpy(dtype=np.float64)
    # Standardizing changes nothing in a full-covariance Gaussian model's
    # probabilities (it is an affine transform) but helps the optimizer.
    x = (x - x.mean(axis=0)) / x.std(axis=0)
    try:
        from hmmlearn.hmm import GaussianHMM

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            hmm = GaussianHMM(
                n_components=N_STATES, covariance_type="full", n_iter=200, random_state=seed
            )
            hmm.fit(x)
            ll = float(hmm.score(x))
        log_b = np.column_stack(
            [
                multivariate_normal.logpdf(x, mean=hmm.means_[s], cov=hmm.covars_[s])
                for s in range(N_STATES)
            ]
        )
        filtered = forward_filter(log_b, hmm.startprob_, hmm.transmat_)
        if not np.isfinite(filtered).all() or not np.isfinite(ll):
            raise FloatingPointError("non-finite filtered probabilities")
        seq = filtered.argmax(axis=1)
        return RegimeFit(
            model="hmm",
            seed=seed,
            log_likelihood=ll,
            filtered=filtered,
            names=label_states(seq, feat["vol20"].to_numpy(dtype=np.float64)),
            transmat=np.asarray(hmm.transmat_, dtype=np.float64),
            converged=bool(hmm.monitor_.converged),
        )
    except Exception:
        from sklearn.mixture import GaussianMixture

        gmm = GaussianMixture(n_components=N_STATES, covariance_type="full", random_state=seed)
        gmm.fit(x)
        probs = np.asarray(gmm.predict_proba(x), dtype=np.float64)
        seq = probs.argmax(axis=1)
        trans = np.zeros((N_STATES, N_STATES))
        np.add.at(trans, (seq[:-1], seq[1:]), 1)
        trans = trans / np.clip(trans.sum(axis=1, keepdims=True), 1, None)
        return RegimeFit(
            model="gmm",
            seed=seed,
            log_likelihood=float(gmm.score(x) * len(x)),
            filtered=probs,
            names=label_states(seq, feat["vol20"].to_numpy(dtype=np.float64)),
            transmat=trans,
            converged=bool(gmm.converged_),
        )


def named_labels(f: RegimeFit) -> npt.NDArray[np.str_]:
    seq = f.filtered.argmax(axis=1)
    return np.array([f.names[int(s)] for s in seq])


def _low_vol(labels: npt.NDArray[np.str_]) -> npt.NDArray[np.bool_]:
    return np.isin(labels, ["calm", "normal"])


def stability(fits: list[RegimeFit], top: int = 3) -> dict[str, Any]:
    """Agreement of every start with the best fit, most likely first.

    ``agreement`` compares all four labels day by day. ``low_vol_agreement``
    only compares the split between the two calmer states (calm, normal) and
    the two more turbulent ones (volatile, crisis).
    """
    ranked = sorted(fits, key=lambda f: f.log_likelihood, reverse=True)
    best = named_labels(ranked[0])
    rows: list[dict[str, Any]] = []
    for f in ranked:
        lab = named_labels(f)
        rows.append(
            {
                "seed": f.seed,
                "model": f.model,
                "log_likelihood": f.log_likelihood,
                "agreement": float((lab == best).mean()),
                "low_vol_agreement": float((_low_vol(lab) == _low_vol(best)).mean()),
                "current": str(lab[-1]),
            }
        )
    runners = rows[1:top]
    return {
        "starts": rows,
        "best_seed": ranked[0].seed,
        "compared_with_best": len(runners),
        "agreement_next_best": (
            float(np.mean([r["agreement"] for r in runners])) if runners else None
        ),
        "low_vol_agreement_next_best": (
            float(np.mean([r["low_vol_agreement"] for r in runners])) if runners else None
        ),
        "current_regime_agreement_next_best": (
            sum(r["current"] == rows[0]["current"] for r in runners) / len(runners)
            if runners
            else None
        ),
    }


_cache: dict[tuple[str, int, int], dict[str, Any]] = {}


def market_regimes(spy_returns: pd.Series, n_starts: int = DEFAULT_STARTS) -> dict[str, Any]:
    """Market-level regime result. Depends only on SPY, so it is cached per data date."""
    key = (str(spy_returns.index[-1].date()), len(spy_returns), n_starts)
    if key in _cache:
        return _cache[key]

    feat = features(spy_returns)
    r = spy_returns.reindex(feat.index).to_numpy(dtype=np.float64)
    fits = [fit(feat, r, seed) for seed in range(n_starts)]
    primary = max(fits, key=lambda f: f.log_likelihood)
    names = primary.names
    order = [next(s for s, n in names.items() if n == lab) for lab in LABELS]
    probs = primary.filtered[:, order]  # columns in LABELS order
    labels = named_labels(primary)

    current = cap_confidence(probs[-1])
    current_label = LABELS[int(current.argmax())]
    days_in = 1
    for lab in labels[-2::-1]:
        if lab != labels[-1]:
            break
        days_in += 1

    characteristics = {}
    for lab in LABELS:
        mask = labels == lab
        rr = r[mask]
        characteristics[lab] = {
            "annualized_return": float(rr.mean() * TRADING_DAYS) if rr.size else None,
            "annualized_vol": float(rr.std(ddof=1) * np.sqrt(TRADING_DAYS))
            if rr.size > 1
            else None,
            "share_of_days": float(mask.mean()),
        }

    trans = primary.transmat[np.ix_(order, order)]
    step = 5
    hist_idx = np.arange(len(feat) - 1, -1, -step)[::-1]
    result: dict[str, Any] = {
        "model": primary.model,
        "converged": primary.converged,
        "current": {
            "regime": current_label,
            "raw_label": str(labels[-1]),
            "probabilities": dict(zip(LABELS, current, strict=True)),
            "days_in_regime": days_in,
            "as_of": str(feat.index[-1].date()),
        },
        "characteristics": characteristics,
        "transition_matrix": {
            a: dict(zip(LABELS, trans[i], strict=True)) for i, a in enumerate(LABELS)
        },
        "expected_duration_days": {
            lab: float(1 / (1 - trans[i, i])) if trans[i, i] < 1 else None
            for i, lab in enumerate(LABELS)
        },
        # History probabilities get the same 95% cap as the current reading.
        "history": cap_history(
            {
                "dates": [str(feat.index[i].date()) for i in hist_idx],
                "step_days": step,
                **{lab: probs[hist_idx, j] for j, lab in enumerate(LABELS)},
                # S&P 500 growth of $1 over the same dates, for context in the chart.
                "spy_growth": np.cumprod(1.0 + r)[hist_idx] / (1.0 + r[0]),
            }
        ),
        "stability": stability(fits),
        "sample": {"start": str(feat.index[0].date()), "end": str(feat.index[-1].date())},
        "method_notes": [
            "Probabilities at each date use only features up to that date (forward filter).",
            "Model parameters are estimated once on the full sample.",
            f"The best of {n_starts} random starts (highest likelihood) is used.",
            "Features are SPY 20-day mean return, 20-day volatility and 60-day mean return.",
        ],
        "_labels": pd.Series(labels, index=feat.index),
    }
    _cache.clear()
    _cache[key] = result
    return result


def to_payload(result: dict[str, Any]) -> dict[str, Any]:
    """JSON-safe form for storing in the snapshot (precomputed nightly)."""
    labels: pd.Series = result["_labels"]
    body = {k: v for k, v in result.items() if not k.startswith("_")}
    body["labels"] = {
        "dates": [str(d.date()) for d in labels.index],
        "values": [str(v) for v in labels],
    }
    return body


def from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    body = {k: v for k, v in payload.items() if k != "labels"}
    lab = payload["labels"]
    body["_labels"] = pd.Series(lab["values"], index=pd.DatetimeIndex(lab["dates"]))
    return body


def analyze(
    spy_returns: pd.Series,
    portfolio_returns: pd.Series,
    precomputed: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Regime section: market regimes plus how this portfolio behaved in each.

    ``precomputed`` is the nightly market result; it is used only if it covers
    the same last date as ``spy_returns``.
    """
    last = str(spy_returns.index[-1].date())
    if precomputed and precomputed.get("sample", {}).get("end") == last:
        market = from_payload(precomputed)
    else:
        market = market_regimes(spy_returns)
    labels: pd.Series = market["_labels"]
    joined = pd.DataFrame(
        {"portfolio": portfolio_returns, "spy": spy_returns, "label": labels}
    ).dropna()
    perf = {}
    for lab in LABELS:
        sub = joined[joined["label"] == lab]
        n = len(sub)
        perf[lab] = {
            "days": n,
            "portfolio_return": float(sub["portfolio"].mean() * TRADING_DAYS) if n >= 20 else None,
            "portfolio_vol": (
                float(sub["portfolio"].std(ddof=1) * np.sqrt(TRADING_DAYS)) if n >= 20 else None
            ),
            "spy_return": float(sub["spy"].mean() * TRADING_DAYS) if n >= 20 else None,
        }
    out = {k: v for k, v in market.items() if not k.startswith("_")}
    # Snapshots precomputed before the history cap existed are capped here too.
    out["history"] = cap_history(out["history"])
    out["portfolio_by_regime"] = perf
    out["portfolio_window"] = {
        "start": str(joined.index[0].date()) if len(joined) else None,
        "end": str(joined.index[-1].date()) if len(joined) else None,
    }
    return out
