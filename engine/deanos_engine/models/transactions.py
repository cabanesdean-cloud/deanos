"""Transaction categorization: features, inference, explanations and evaluation.

The classifier is a multinomial logistic regression over three feature blocks
extracted from a bank statement descriptor:

* character n-grams (3 to 5 characters, within word boundaries), which survive
  truncation, missing spaces and store numbers ("STARBUCKS #1234" and
  "STARBUCK" share most of their n-grams);
* word unigrams and bigrams ("coffee", "family dental");
* a handful of amount indicators (debit or credit, a magnitude bin, round
  dollars, .99 endings), or an "amount missing" flag.

Text blocks are TF-IDF weighted with sublinear term frequency and L2-normalized
per block. Probabilities are softmax(logits / T), where the temperature T is
fitted on a validation split of held-out merchants (temperature scaling).

Training happens offline (scripts/build_transactions_model.py, with
scikit-learn); this module only needs NumPy. The trained weights ship as a JSON
artifact next to this file. Every function here is pure apart from the cached
artifact load.
"""

from __future__ import annotations

import base64
import json
import math
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

ARTIFACT_PATH = Path(__file__).with_name("transactions_model.json")

MAX_DESCRIPTION = 200
MAX_BATCH = 25
MAX_AMOUNT = 1_000_000.0
CHAR_NGRAMS = (3, 4, 5)
AMOUNT_EDGES = (5.0, 15.0, 40.0, 100.0, 300.0, 1000.0, 3000.0)
BLOCKS = ("char", "word", "amount")
DOLLAR = "$"

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]
BoolArray = npt.NDArray[np.bool_]


class TransactionsError(ValueError):
    """Input the categorizer cannot use (returned to API callers as a 400)."""


# ─── Text normalization and features ─────────────────────────────────────────

_KEEP = re.compile(r"[^a-z0-9*&./#+\- ]+")
_WORD = re.compile(r"[a-z]{2,}")


def normalize(text: str) -> str:
    """Lowercase ASCII form of a descriptor: accents folded, digits mapped to 0.

    Store numbers, dates and reference numbers vary on every receipt; mapping
    each digit to 0 keeps their shape ("#0000") without letting the model
    memorize them. Characters outside a small set become spaces.
    """
    folded = unicodedata.normalize("NFKD", text[: MAX_DESCRIPTION * 2])
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    s = folded.lower().replace("'", "")
    s = _KEEP.sub(" ", s)
    s = re.sub(r"[0-9]", "0", s)
    return " ".join(s.split())[:MAX_DESCRIPTION]


def _amount_bin(value: float) -> int:
    a = abs(value)
    for i, edge in enumerate(AMOUNT_EDGES):
        if a < edge:
            return i
    return len(AMOUNT_EDGES)


def amount_bin_label(i: int) -> str:
    lo = 0.0 if i == 0 else AMOUNT_EDGES[i - 1]
    if i >= len(AMOUNT_EDGES):
        return f"{DOLLAR}{lo:,.0f} or more"
    return f"{DOLLAR}{lo:,.0f} to {DOLLAR}{AMOUNT_EDGES[i]:,.0f}"


def amount_features(amount: float | None) -> list[str]:
    if amount is None:
        return ["a:missing"]
    feats = ["a:credit" if amount > 0 else "a:debit", f"a:bin{_amount_bin(amount)}"]
    cents = round(abs(amount) * 100) % 100
    if cents == 0 and abs(amount) >= 1:
        feats.append("a:round")
        if abs(amount) >= 100 and round(abs(amount)) % 50 == 0:
            feats.append("a:round50")
    elif cents in (95, 99):
        feats.append("a:x99")
    return feats


@dataclass(frozen=True)
class Extracted:
    """Raw feature counts for one descriptor, plus where each came from."""

    normalized: str
    words: list[str]
    counts: Counter[str]
    # feature -> word indices it was found in (one entry per occurrence)
    origin: dict[str, list[int]] = field(default_factory=dict)


def extract(description: str, amount: float | None) -> Extracted:
    norm = normalize(description)
    words = norm.split()
    counts: Counter[str] = Counter()
    origin: dict[str, list[int]] = {}

    def add(feat: str, where: Sequence[int]) -> None:
        counts[feat] += 1
        origin.setdefault(feat, []).extend(where)

    for wi, w in enumerate(words):
        padded = f" {w} "
        for n in CHAR_NGRAMS:
            for i in range(len(padded) - n + 1):
                add("c:" + padded[i : i + n], (wi,))
    tokens: list[tuple[str, int]] = []
    for wi, w in enumerate(words):
        tokens.extend((m.group(0), wi) for m in _WORD.finditer(w))
    for t, wi in tokens:
        add("w:" + t, (wi,))
    for (t1, w1), (t2, w2) in zip(tokens, tokens[1:], strict=False):
        add(f"w:{t1} {t2}", (w1, w2))
    for f in amount_features(amount):
        add(f, ())
    return Extracted(norm, words, counts, origin)


# ─── The model ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Model:
    categories: tuple[str, ...]
    labels: tuple[str, ...]
    features: tuple[str, ...]
    index: dict[str, int]
    idf: FloatArray
    block: IntArray  # 0 char, 1 word, 2 amount
    coef: FloatArray  # (n_features, n_classes)
    intercept: FloatArray  # (n_classes,)
    temperature: float
    amount_weight: float
    meta: dict[str, Any]

    @property
    def n_classes(self) -> int:
        return len(self.categories)

    def label_of(self, category: str) -> str:
        return self.labels[self.categories.index(category)]


def feature_blocks(features: Sequence[str]) -> IntArray:
    return np.array(
        [0 if f.startswith("c:") else 1 if f.startswith("w:") else 2 for f in features],
        dtype=np.int64,
    )


def _b64(arr: npt.NDArray[Any], dtype: str) -> str:
    return base64.b64encode(np.ascontiguousarray(arr, dtype=dtype).tobytes()).decode("ascii")


def _unb64(s: str, dtype: str, shape: tuple[int, ...]) -> FloatArray:
    raw = np.frombuffer(base64.b64decode(s), dtype=dtype)
    return raw.astype(np.float64).reshape(shape)


def model_to_artifact(model: Model) -> dict[str, Any]:
    """Serialize: feature names as text, weights as base64 little-endian float blobs."""
    return {
        "format": "deanos-transactions-v1",
        "categories": [
            {"id": c, "label": lbl} for c, lbl in zip(model.categories, model.labels, strict=True)
        ],
        "features": list(model.features),
        "idf_f32": _b64(model.idf, "<f4"),
        "coef_f16": _b64(model.coef, "<f2"),
        "intercept": [round(float(v), 6) for v in model.intercept],
        "temperature": model.temperature,
        "amount_weight": model.amount_weight,
        "meta": model.meta,
    }


def model_from_artifact(art: dict[str, Any]) -> Model:
    if art.get("format") != "deanos-transactions-v1":
        raise ValueError("Unknown transactions model format.")
    cats = tuple(str(c["id"]) for c in art["categories"])
    labels = tuple(str(c["label"]) for c in art["categories"])
    feats = tuple(str(f) for f in art["features"])
    n, k = len(feats), len(cats)
    return Model(
        categories=cats,
        labels=labels,
        features=feats,
        index={f: i for i, f in enumerate(feats)},
        idf=_unb64(art["idf_f32"], "<f4", (n,)),
        block=feature_blocks(feats),
        coef=_unb64(art["coef_f16"], "<f2", (n, k)),
        intercept=np.asarray(art["intercept"], dtype=np.float64),
        temperature=float(art["temperature"]),
        amount_weight=float(art["amount_weight"]),
        meta=dict(art.get("meta", {})),
    )


@lru_cache(maxsize=1)
def load_model(path: str | None = None) -> Model:
    """The shipped model, parsed once per process."""
    p = Path(path) if path else ARTIFACT_PATH
    with p.open(encoding="utf-8") as fh:
        return model_from_artifact(json.load(fh))


@dataclass(frozen=True)
class Vector:
    idx: IntArray
    val: FloatArray
    extracted: Extracted
    unknown: int  # features in the input the model has never seen


def transform(
    ex: Extracted,
    index: dict[str, int],
    idf: FloatArray,
    block: IntArray,
    amount_weight: float,
) -> Vector:
    """TF-IDF (sublinear tf) per text block, each block L2-normalized; amount flags constant."""
    idx_list: list[int] = []
    val_list: list[float] = []
    unknown = 0
    for feat, c in ex.counts.items():
        j = index.get(feat)
        if j is None:
            unknown += 1
            continue
        idx_list.append(j)
        val_list.append((1.0 + math.log(c)) * float(idf[j]))
    idx = np.asarray(idx_list, dtype=np.int64)
    val = np.asarray(val_list, dtype=np.float64)
    if idx.size:
        blk = block[idx]
        for b in (0, 1):
            mask = blk == b
            norm = float(np.sqrt(np.sum(val[mask] ** 2)))
            if norm > 0:
                val[mask] /= norm
        val[blk == 2] = amount_weight
        order = np.argsort(idx)
        idx, val = idx[order], val[order]
    return Vector(idx, val, ex, unknown)


def vectorize(model: Model, description: str, amount: float | None) -> Vector:
    return transform(
        extract(description, amount), model.index, model.idf, model.block, model.amount_weight
    )


def softmax(z: FloatArray) -> FloatArray:
    e = np.exp(z - np.max(z, axis=-1, keepdims=True))
    out: FloatArray = e / np.sum(e, axis=-1, keepdims=True)
    return out


def logits(model: Model, v: Vector) -> FloatArray:
    raw: FloatArray = v.val @ model.coef[v.idx] + model.intercept
    return raw


def predict_proba(model: Model, v: Vector, calibrated: bool = True) -> FloatArray:
    t = model.temperature if calibrated else 1.0
    return softmax(logits(model, v) / t)


# ─── Input checks ────────────────────────────────────────────────────────────


def check_input(description: str, amount: float | None) -> None:
    if len(description) > MAX_DESCRIPTION:
        raise TransactionsError(f"Descriptions are limited to {MAX_DESCRIPTION} characters.")
    if amount is not None and (not math.isfinite(amount) or abs(amount) > MAX_AMOUNT):
        raise TransactionsError(
            f"Amounts must be between -{MAX_AMOUNT:,.0f} and {MAX_AMOUNT:,.0f}."
        )
    if not re.search(r"[a-z0-9]", normalize(description)):
        raise TransactionsError(
            "The description has no letters or digits the model can read (it works on "
            "Latin-alphabet statement text)."
        )


# ─── Explanations ────────────────────────────────────────────────────────────

_AMOUNT_NAMES = {
    "missing": "no amount given",
    "credit": "money in (credit)",
    "debit": "money out (debit)",
    "round": "whole-dollar amount",
    "round50": "multiple of $50",
    "x99": "price ending in .99 or .95",
}


def describe_feature(feat: str) -> dict[str, str]:
    kind, _, body = feat.partition(":")
    if kind == "c":
        return {"kind": "char", "text": body, "display": "“" + body.replace(" ", "·") + "”"}
    if kind == "w":
        return {"kind": "word", "text": body, "display": "“" + body + "”"}
    if body.startswith("bin"):
        return {
            "kind": "amount",
            "text": body,
            "display": "amount " + amount_bin_label(int(body[3:])),
        }
    return {"kind": "amount", "text": body, "display": _AMOUNT_NAMES.get(body, body)}


def explain(model: Model, v: Vector, category: str, top: int = 8) -> dict[str, Any]:
    """Additive breakdown of the calibrated logit for one class.

    Softmax is unchanged by adding the same constant to every logit, so each
    weight is measured against the average weight across classes. A feature's
    contribution is value x (weight for this class - mean weight) / T, and the
    contributions plus the centered bias add up exactly to the class's centered
    logit: positive pushes toward this category, negative away from it.
    """
    c = model.categories.index(category)
    t = model.temperature
    w = model.coef[v.idx]
    centered = (w[:, c] - w.mean(axis=1)) if v.idx.size else np.zeros(0)
    contrib = v.val * centered / t
    bias = float((model.intercept[c] - model.intercept.mean()) / t)

    words = v.extracted.words
    per_word = np.zeros(len(words))
    amount_total = 0.0
    feats: list[dict[str, Any]] = []
    for j, cval in zip(v.idx.tolist(), contrib.tolist(), strict=True):
        name = model.features[j]
        where = v.extracted.origin.get(name, [])
        if model.block[j] == 2 or not where:
            amount_total += cval
        else:
            share = cval / len(where)
            for wi in where:
                per_word[wi] += share
        feats.append({"feature": name, **describe_feature(name), "contribution": cval})
    feats.sort(key=lambda f: -abs(f["contribution"]))
    return {
        "category": category,
        "label": model.labels[c],
        "bias": bias,
        "total": bias + float(contrib.sum()),
        "tokens": [{"text": wd, "contribution": float(per_word[i])} for i, wd in enumerate(words)],
        "amount": amount_total,
        "features": feats[:top],
        "for": [f for f in feats if f["contribution"] > 0][:top],
        "against": [f for f in feats if f["contribution"] < 0][:top],
    }


def confidence_band(p: float) -> str:
    return "high" if p >= 0.9 else "medium" if p >= 0.6 else "low"


def categorize(
    model: Model, description: str, amount: float | None = None, k: int = 3
) -> dict[str, Any]:
    """Top-k categories with calibrated probabilities and why the top one won."""
    check_input(description, amount)
    v = vectorize(model, description, amount)
    p = predict_proba(model, v)
    order = np.argsort(-p, kind="stable")
    k = max(1, min(k, model.n_classes))
    best = model.categories[int(order[0])]
    total_feats = sum(1 for f in v.extracted.counts if not f.startswith("a:"))
    known_feats = sum(1 for j in v.idx.tolist() if model.block[j] != 2)
    return {
        "input": {"normalized": v.extracted.normalized, "amount": amount},
        "prediction": {
            "category": best,
            "label": model.label_of(best),
            "probability": float(p[order[0]]),
            "confidence": confidence_band(float(p[order[0]])),
        },
        "top": [
            {
                "category": model.categories[int(i)],
                "label": model.labels[int(i)],
                "probability": float(p[i]),
            }
            for i in order[:k]
        ],
        "probabilities": {model.categories[i]: float(p[i]) for i in range(model.n_classes)},
        "explanation": explain(model, v, best),
        "coverage": {
            "known_text_features": known_feats,
            "text_features": total_feats,
            "share": known_feats / total_feats if total_feats else 0.0,
        },
    }


def predict_many(
    model: Model, items: Iterable[tuple[str, float | None]], calibrated: bool = True
) -> FloatArray:
    """Probabilities for many descriptors (no input checks; for evaluation)."""
    rows = [predict_proba(model, vectorize(model, d, a), calibrated) for d, a in items]
    if not rows:
        return np.zeros((0, model.n_classes))
    return np.vstack(rows)


def top_features(model: Model, per_class: int = 8) -> dict[str, list[dict[str, Any]]]:
    """Strongest words and amount flags per class (centered weights; n-grams omitted)."""
    centered = model.coef - model.coef.mean(axis=1, keepdims=True)
    out: dict[str, list[dict[str, Any]]] = {}
    readable = model.block != 0
    for c, cat in enumerate(model.categories):
        col = np.where(readable, centered[:, c], -np.inf)
        best = np.argsort(-col, kind="stable")[:per_class]
        out[cat] = [
            {
                "feature": model.features[j],
                **describe_feature(model.features[j]),
                "weight": float(centered[j, c]),
            }
            for j in best.tolist()
            if np.isfinite(col[j])
        ]
    return out


# ─── Examples to try ─────────────────────────────────────────────────────────

# Hand-written descriptors for the page, each chosen to show one behavior.
PRESETS: tuple[tuple[str, float | None, str], ...] = (
    ("SQ *BLUE HERON COFFEE SAN DIEGO CA", -6.75, "A local cafe the model has never seen"),
    ("TST* LUCKY NOODLE BAR", -38.20, "Restaurant point-of-sale prefix"),
    ("CHECKCARD 0914 SHELL OIL 57442 SEATTLE WA", -48.10, "A fuel brand held out of training"),
    ("NETFLIX.COM 866-579-7172 CA", -15.49, "A subscription seen in training"),
    ("UBER *TRIP HELP.UBER.COM", -23.40, "Rideshare, seen in training"),
    ("WALMART SUPERCENTER #1234", -86.40, "A held-out brand that sells everything"),
    ("ACME ROBOTICS PAYROLL PPD ID: 1234567890", 2450.00, "Payroll deposit"),
    ("ZELLE TO JORDAN P", -120.00, "Peer-to-peer payment"),
    ("MONTHLY MAINTENANCE FEE", -12.00, "A bank fee worded differently from training"),
    ("PARKSIDE FAMILY DENTAL", -150.00, "Local health provider"),
    ("OAKWOOD APTS RENT", -2100.00, "Rent, round amount"),
    ("PUBLIX #1422 TAMPA FL", -64.12, "A grocery chain held out of training"),
    ("zzkq 4471", None, "No real words: the model leans on the number's shape"),
)


# ─── Keyword baseline ────────────────────────────────────────────────────────

# The rule list a person might write in an afternoon: generic words plus a few
# of the most common brands. First match wins. Written by the same author as
# the data generator, so if anything it is flattered by the comparison.
_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("fees", (r"\bfee\b", "interest charge", "overdraft", r"\bnsf\b")),
    ("income", ("payroll", "dir dep", "direct dep", "tax ref", "treas 000", "interest payment")),
    (
        "transfers",
        ("zelle", "venmo", "cash app", "transfer", "autopay", "epayment", "e-payment",
         "online pmt", "atm withdrawal"),
    ),
    (
        "housing",
        (r"\brent\b", r"\bapts?\b", "apartments", "mortgage", r"\bmtg\b", r"\bhoa\b",
         "property mgmt"),
    ),
    (
        "utilities",
        ("energy", "electric", "water", "utilit", r"\bpower\b", "wireless", "mobile", "comcast",
         "xfinity", "verizon", "internet", "fiber", "waste"),
    ),
    ("fuel", (r"\bgas\b", "fuel", "petro", r"\boil\b", "chevron", "exxon", "arco", "valero")),
    ("transport", ("uber", "lyft", "parking", "transit", "taxi", r"\bcab\b", r"\btoll\b", "metro")),
    (
        "travel",
        ("airline", "air lines", "hotel", r"\binn\b", "motel", "resort", "airbnb", "expedia",
         "marriott", "hilton", "car rental", "rent-a-car"),
    ),
    (
        "subscriptions",
        ("netflix", "spotify", "hulu", "disney", "subscr", "premium", "membership",
         "monthly plan", r"apple\.com/bill", r"\bprime\b"),
    ),
    (
        "dining",
        ("restaurant", r"\bcafe\b", "coffee", "pizza", "grill", "burger", "kitchen", "sushi",
         "taqueria", "bakery", "diner", "taco", "ramen", r"\bpho\b", "bbq", "bistro", "starbucks",
         "mcdonald", "doordash", r"\beats\b", r"\btst\b"),
    ),
    (
        "groceries",
        ("market", r"\bmkt\b", "grocery", r"\bfoods\b", "supermarket", "safeway", "kroger",
         "trader joe", "whole foods", "produce"),
    ),
    (
        "health",
        ("pharmacy", r"\bcvs\b", "walgreens", "dental", "medical", "clinic", "urgent care",
         "fitness", "chiropractic", "therapy", "optometry", "dermatology", "pediatrics", "yoga"),
    ),
    (
        "entertainment",
        ("cinema", "theat", "movie", "ticket", "bowling", "museum", r"\bzoo\b", "arcade", "steam",
         "playstation", "nintendo", "golf"),
    ),
    (
        "shopping",
        ("amazon", "amzn", "target", "walmart", "best buy", "home depot", "ikea", "store", "shop",
         "boutique", "outfitters", "hardware"),
    ),
)  # fmt: skip
KEYWORD_RULES: tuple[tuple[str, str], ...] = tuple((c, "|".join(k)) for c, k in _KEYWORDS)
_RULES = tuple((cat, re.compile(pat)) for cat, pat in KEYWORD_RULES)


def keyword_rule(description: str) -> str | None:
    s = normalize(description)
    for cat, pat in _RULES:
        if pat.search(s):
            return cat
    return None


# ─── Evaluation ──────────────────────────────────────────────────────────────


def confusion_matrix(y_true: Sequence[int], y_pred: Sequence[int], k: int) -> IntArray:
    m = np.zeros((k, k), dtype=np.int64)
    for t, p in zip(y_true, y_pred, strict=True):
        m[t, p] += 1
    return m


def report(conf: IntArray, categories: Sequence[str]) -> dict[str, Any]:
    """Accuracy, macro/weighted F1 and per-class precision/recall/F1 from a confusion matrix."""
    tp = np.diag(conf).astype(float)
    support = conf.sum(axis=1).astype(float)
    predicted = conf.sum(axis=0).astype(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        precision = np.where(predicted > 0, tp / predicted, 0.0)
        recall = np.where(support > 0, tp / support, 0.0)
        f1 = np.where(precision + recall > 0, 2 * precision * recall / (precision + recall), 0.0)
    n = float(conf.sum())
    return {
        "n": int(n),
        "accuracy": float(tp.sum() / n) if n else 0.0,
        "macro_f1": float(f1.mean()),
        "weighted_f1": float((f1 * support).sum() / n) if n else 0.0,
        "per_class": [
            {
                "category": c,
                "precision": float(precision[i]),
                "recall": float(recall[i]),
                "f1": float(f1[i]),
                "support": int(support[i]),
            }
            for i, c in enumerate(categories)
        ],
    }


def reliability(confidence: FloatArray, correct: BoolArray, bins: int = 10) -> dict[str, Any]:
    """Reliability diagram data and expected calibration error (equal-width confidence bins)."""
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.digitize(confidence, edges[1:-1], right=True), 0, bins - 1)
    rows: list[dict[str, Any]] = []
    ece = 0.0
    n = len(confidence)
    for b in range(bins):
        mask = idx == b
        cnt = int(mask.sum())
        conf_b: float | None = None
        acc_b: float | None = None
        if cnt:
            conf_b = float(confidence[mask].mean())
            acc_b = float(correct[mask].mean())
            ece += cnt / n * abs(acc_b - conf_b)
        rows.append(
            {
                "lower": float(edges[b]),
                "upper": float(edges[b + 1]),
                "count": cnt,
                "confidence": conf_b,
                "accuracy": acc_b,
            }
        )
    return {"bins": rows, "ece": ece}


def coverage_curve(
    confidence: FloatArray, correct: BoolArray, thresholds: Sequence[float]
) -> list[dict[str, float | None]]:
    """Auto-apply only predictions at or above a confidence threshold: how many, how accurate."""
    out: list[dict[str, float | None]] = []
    for t in thresholds:
        mask = confidence >= t
        out.append(
            {
                "threshold": float(t),
                "coverage": float(mask.mean()) if len(mask) else 0.0,
                "accuracy": float(correct[mask].mean()) if mask.any() else None,
            }
        )
    return out


def log_loss(proba: FloatArray, y: Sequence[int]) -> float:
    p = np.clip(proba[np.arange(len(y)), np.asarray(y, dtype=np.int64)], 1e-15, 1.0)
    return float(-np.mean(np.log(p)))


def group_bootstrap(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    groups: Sequence[str],
    k: int,
    baseline_pred: Sequence[int] | None = None,
    n_boot: int = 1000,
    seed: int = 0,
) -> dict[str, list[float]]:
    """95% intervals for accuracy and macro-F1, resampling whole merchant groups.

    Rows from one merchant are not independent (a model that misses a brand
    misses all of its rows), so the bootstrap draws merchants, not rows. With a
    baseline, the same draws give a paired interval for the accuracy gain.
    """
    by_group: dict[str, list[int]] = {}
    for i, g in enumerate(groups):
        by_group.setdefault(g, []).append(i)
    keys = sorted(by_group)
    rng = np.random.default_rng(seed)
    yt = np.asarray(y_true, dtype=np.int64)
    yp = np.asarray(y_pred, dtype=np.int64)
    yb = np.asarray(baseline_pred, dtype=np.int64) if baseline_pred is not None else None
    names = [str(i) for i in range(k)]
    acc: list[float] = []
    f1s: list[float] = []
    gain: list[float] = []
    for _ in range(n_boot):
        draw = rng.integers(0, len(keys), len(keys))
        idx = np.concatenate([by_group[keys[d]] for d in draw])
        rep = report(confusion_matrix(yt[idx].tolist(), yp[idx].tolist(), k), names)
        acc.append(rep["accuracy"])
        f1s.append(rep["macro_f1"])
        if yb is not None:
            gain.append(rep["accuracy"] - float(np.mean(yb[idx] == yt[idx])))
    out = {
        "accuracy": [float(np.quantile(acc, 0.025)), float(np.quantile(acc, 0.975))],
        "macro_f1": [float(np.quantile(f1s, 0.025)), float(np.quantile(f1s, 0.975))],
    }
    if gain:
        out["accuracy_gain"] = [float(np.quantile(gain, 0.025)), float(np.quantile(gain, 0.975))]
    return out


THRESHOLDS = (0.0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99)


def evaluate(
    model: Model, items: Sequence[tuple[str, float | None]], y_true: Sequence[str]
) -> dict[str, Any]:
    """Every held-out metric the site reports, for one model on one labeled set."""
    y = np.asarray([model.categories.index(c) for c in y_true], dtype=np.int64)
    vecs = [vectorize(model, d, a) for d, a in items]
    z = np.vstack([logits(model, v) for v in vecs]) if vecs else np.zeros((0, model.n_classes))
    raw = softmax(z)
    proba = softmax(z / model.temperature)
    pred = proba.argmax(axis=1)
    conf = proba.max(axis=1)
    correct = pred == y
    cm = confusion_matrix(y.tolist(), pred.tolist(), model.n_classes)
    top3 = np.argsort(-proba, axis=1, kind="stable")[:, :3]
    return {
        **report(cm, model.categories),
        "top3_accuracy": float(np.mean([y[i] in top3[i] for i in range(len(y))]))
        if len(y)
        else 0.0,
        "log_loss": log_loss(proba, y.tolist()),
        "log_loss_uncalibrated": log_loss(raw, y.tolist()),
        "confusion": cm.tolist(),
        "calibration": reliability(conf, correct),
        "calibration_uncalibrated": reliability(raw.max(axis=1), raw.argmax(axis=1) == y),
        "coverage": coverage_curve(conf, correct, THRESHOLDS),
        "predictions": pred.tolist(),
    }


def evaluate_rules(
    items: Sequence[tuple[str, float | None]],
    y_true: Sequence[str],
    categories: Sequence[str],
    fallback: str,
) -> dict[str, Any]:
    """Keyword baseline; descriptors no rule matches get the fallback (most common) class."""
    cats = list(categories)
    hits = [keyword_rule(d) for d, _ in items]
    pred = [cats.index(h if h is not None else fallback) for h in hits]
    cm = confusion_matrix([cats.index(c) for c in y_true], pred, len(cats))
    return {
        **report(cm, cats),
        "matched_share": sum(h is not None for h in hits) / max(len(hits), 1),
        "confusion": cm.tolist(),
    }


def evaluate_majority(
    y_true: Sequence[str], categories: Sequence[str], majority: str
) -> dict[str, Any]:
    cats = list(categories)
    pred = [cats.index(majority)] * len(y_true)
    cm = confusion_matrix([cats.index(c) for c in y_true], pred, len(cats))
    return report(cm, cats)
