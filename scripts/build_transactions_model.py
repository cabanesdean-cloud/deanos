"""Build the Transaction ML model artifact from the synthetic data generator.

    cd engine && uv run python ../scripts/build_transactions_model.py

Generates the synthetic transactions, splits them by merchant group, learns
the vocabulary and IDF weights on the training split, tunes the regularization
strength on the validation split, fits a temperature for calibration on the
validation split, and evaluates once on the test split. Also measures the
baselines, a few ablations, and how much a random (leaky) split would flatter
the model. Writes engine/deanos_engine/models/transactions_model.json.

Deterministic: the generator is seeded, the solver (L-BFGS) is deterministic,
and the output is written with sorted keys and rounded floats, so rerunning the
script on the same machine reproduces the file byte for byte.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
from scipy import sparse
from scipy.optimize import minimize_scalar
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from deanos_engine.models import transactions as tx  # noqa: E402
from deanos_engine.models import transactions_synth as synth  # noqa: E402

MIN_DF_CHAR = 3
MIN_DF_WORD = 2
AMOUNT_WEIGHT = 0.5
C_GRID = (1.0, 3.0, 10.0, 30.0)
SAMPLES = 36

Item = tuple[str, float | None]


def fit_vocab(
    exs: Sequence[tx.Extracted], blocks: Sequence[str] = tx.BLOCKS
) -> tuple[list[str], np.ndarray]:
    df: Counter[str] = Counter()
    for ex in exs:
        df.update(ex.counts.keys())
    n = len(exs)
    keep_prefix = {"char": "c:", "word": "w:", "amount": "a:"}
    allowed = tuple(keep_prefix[b] for b in blocks)
    feats = sorted(
        f
        for f, d in df.items()
        if f.startswith(allowed)
        and (
            f.startswith("a:")
            or (f.startswith("c:") and d >= MIN_DF_CHAR)
            or (f.startswith("w:") and d >= MIN_DF_WORD)
        )
    )
    idf = np.array(
        [1.0 if f.startswith("a:") else math.log((1 + n) / (1 + df[f])) + 1.0 for f in feats]
    )
    return feats, idf


def design(exs: Sequence[tx.Extracted], feats: Sequence[str], idf: np.ndarray) -> sparse.csr_matrix:
    index = {f: i for i, f in enumerate(feats)}
    block = tx.feature_blocks(feats)
    rows, cols, vals = [], [], []
    for r, ex in enumerate(exs):
        v = tx.transform(ex, index, idf, block, AMOUNT_WEIGHT)
        rows.extend([r] * v.idx.size)
        cols.extend(v.idx.tolist())
        vals.extend(v.val.tolist())
    return sparse.csr_matrix((vals, (rows, cols)), shape=(len(exs), len(feats)))


def fit(x: sparse.csr_matrix, y: Sequence[int], c: float) -> LogisticRegression:
    clf = LogisticRegression(C=c, max_iter=5000, tol=1e-6)
    clf.fit(x, np.asarray(y))
    return clf


def macro_f1(y: Sequence[int], pred: Sequence[int], k: int) -> float:
    return float(tx.report(tx.confusion_matrix(y, pred, k), [str(i) for i in range(k)])["macro_f1"])


def to_model(
    clf: LogisticRegression, feats: Sequence[str], idf: np.ndarray, temperature: float
) -> tx.Model:
    coef = np.asarray(clf.coef_, dtype=np.float64).T
    # Round-trip through the artifact encoding so evaluation uses the shipped weights.
    m = tx.Model(
        categories=synth.CATEGORY_IDS,
        labels=tuple(lbl for _, lbl in synth.CATEGORIES),
        features=tuple(feats),
        index={f: i for i, f in enumerate(feats)},
        idf=idf,
        block=tx.feature_blocks(feats),
        coef=coef,
        intercept=np.asarray(clf.intercept_, dtype=np.float64),
        temperature=temperature,
        amount_weight=AMOUNT_WEIGHT,
        meta={},
    )
    return tx.model_from_artifact(json.loads(json.dumps(tx.model_to_artifact(m))))


def fit_temperature(z: np.ndarray, y: Sequence[int]) -> float:
    yy = np.asarray(y)

    def nll(t: float) -> float:
        return tx.log_loss(tx.softmax(z / t), yy.tolist())

    res = minimize_scalar(nll, bounds=(0.05, 10.0), method="bounded", options={"xatol": 1e-6})
    return round(float(res.x), 4)


def rounded(obj: Any, dp: int = 6) -> Any:
    if isinstance(obj, dict):
        return {str(k): rounded(v, dp) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [rounded(v, dp) for v in obj]
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return round(f, dp) if math.isfinite(f) else None
    if isinstance(obj, np.integer):
        return int(obj)
    return obj


def headline(ev: dict[str, Any]) -> dict[str, float]:
    return {"accuracy": ev["accuracy"], "macro_f1": ev["macro_f1"], "n": ev["n"]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=tx.ARTIFACT_PATH)
    ap.add_argument("--seed", type=int, default=synth.DEFAULT_SEED)
    args = ap.parse_args()
    t0 = time.perf_counter()

    rows = synth.generate(seed=args.seed)
    split: dict[str, list[synth.Transaction]] = {"train": [], "val": [], "test": []}
    for r in rows:
        split[r.split].append(r)
    cats = list(synth.CATEGORY_IDS)
    items = {k: [(r.description, r.amount) for r in v] for k, v in split.items()}
    ys = {k: [cats.index(r.category) for r in v] for k, v in split.items()}
    exs = {k: [tx.extract(d, a) for d, a in v] for k, v in items.items()}
    print(f"generated {len(rows):,} rows in {time.perf_counter() - t0:.1f}s", file=sys.stderr)

    # 1. Vocabulary and IDF on the training split only.
    feats, idf = fit_vocab(exs["train"])
    x = {k: design(exs[k], feats, idf) for k in split}
    print(f"{len(feats):,} features", file=sys.stderr)

    # 2. Regularization strength by validation macro-F1 (held-out merchants).
    grid = []
    best: tuple[float, float, LogisticRegression] | None = None
    for c in C_GRID:
        clf = fit(x["train"], ys["train"], c)
        f1 = macro_f1(ys["val"], clf.predict(x["val"]).tolist(), len(cats))
        ll = tx.log_loss(clf.predict_proba(x["val"]), ys["val"])
        grid.append({"C": c, "val_macro_f1": f1, "val_log_loss": ll})
        print(f"C={c}: val macro-F1 {f1:.4f}, log loss {ll:.4f}", file=sys.stderr)
        if best is None or f1 > best[1] + 1e-9:
            best = (c, f1, clf)
    assert best is not None
    c_best, _, clf = best

    # 3. Temperature on the validation split, using the shipped (rounded) weights.
    m1 = to_model(clf, feats, idf, 1.0)
    z_val = np.vstack([tx.logits(m1, tx.vectorize(m1, d, a)) for d, a in items["val"]])
    temperature = fit_temperature(z_val, ys["val"])
    model = to_model(clf, feats, idf, temperature)
    print(f"C={c_best}, temperature {temperature}", file=sys.stderr)

    # 4. One evaluation on the test split.
    y_test = [r.category for r in split["test"]]
    ev = tx.evaluate(model, items["test"], y_test)
    pred_test = ev.pop("predictions")
    groups_test = [r.group for r in split["test"]]
    majority = Counter(r.category for r in split["train"]).most_common(1)[0][0]
    rules = tx.evaluate_rules(items["test"], y_test, cats, fallback=majority)
    rule_pred = [cats.index(tx.keyword_rule(d) or majority) for d, _ in items["test"]]
    ev["interval"] = tx.group_bootstrap(
        ys["test"], pred_test, groups_test, len(cats), baseline_pred=rule_pred, seed=args.seed
    )
    rules["interval"] = tx.group_bootstrap(
        ys["test"], rule_pred, groups_test, len(cats), seed=args.seed
    )
    # Hybrid: a matching keyword rule wins, the model handles everything else.
    hyb_pred = [
        cats.index(h) if (h := tx.keyword_rule(d)) is not None else p
        for (d, _), p in zip(items["test"], pred_test, strict=True)
    ]
    hybrid = tx.report(tx.confusion_matrix(ys["test"], hyb_pred, len(cats)), cats)
    hybrid["interval"] = tx.group_bootstrap(
        ys["test"], hyb_pred, groups_test, len(cats), seed=args.seed
    )
    by_kind: dict[str, list[bool]] = {}
    for r, p, t in zip(split["test"], pred_test, ys["test"], strict=True):
        by_kind.setdefault(r.kind, []).append(p == t)
    ev["by_merchant_kind"] = [
        {"kind": k, "rows": len(v), "accuracy": sum(v) / len(v)} for k, v in sorted(by_kind.items())
    ]
    ev["test_merchant_groups"] = len(set(groups_test))
    naive = tx.evaluate_majority(y_test, cats, majority)
    no_amount = tx.evaluate(model, [(d, None) for d, _ in items["test"]], y_test)

    # 5. Ablations (reported, not used for any choice).
    ablations = []
    for name, blocks in (
        ("Words only", ("word",)),
        ("Character n-grams only", ("char",)),
        ("Characters + words", ("char", "word")),
        ("Characters + words + amount (shipped)", tx.BLOCKS),
    ):
        f_b, idf_b = fit_vocab(exs["train"], blocks)
        clf_b = fit(design(exs["train"], f_b, idf_b), ys["train"], c_best)
        pred_b = clf_b.predict(design(exs["test"], f_b, idf_b)).tolist()
        rep = tx.report(tx.confusion_matrix(ys["test"], pred_b, len(cats)), cats)
        ablations.append({"features": name, "n_features": len(f_b), **headline(rep)})
        print(f"ablation {name}: {rep['accuracy']:.4f}", file=sys.stderr)

    # 6. Leakage: the same pipeline on a random row split (test merchants seen in training).
    rng = random.Random(args.seed + 5)
    order = list(range(len(rows)))
    rng.shuffle(order)
    n_tr = int(len(rows) * synth.SPLIT_SHARES["train"])
    n_te = int(len(rows) * synth.SPLIT_SHARES["test"])
    tr_i, te_i = order[:n_tr], order[len(rows) - n_te :]
    ex_all = [tx.extract(r.description, r.amount) for r in rows]
    f_r, idf_r = fit_vocab([ex_all[i] for i in tr_i])
    clf_r = fit(
        design([ex_all[i] for i in tr_i], f_r, idf_r),
        [cats.index(rows[i].category) for i in tr_i],
        c_best,
    )
    y_r = [cats.index(rows[i].category) for i in te_i]
    pred_r = clf_r.predict(design([ex_all[i] for i in te_i], f_r, idf_r)).tolist()
    rep_r = tx.report(tx.confusion_matrix(y_r, pred_r, len(cats)), cats)
    seen = {rows[i].merchant for i in tr_i}
    leakage = {
        "random_split": headline(rep_r),
        "merchant_split": headline(ev),
        "random_test_rows_with_seen_merchant": sum(rows[i].merchant in seen for i in te_i)
        / len(te_i),
    }

    # 7. Samples for the page: held-out test rows, predicted live by the API.
    srng = random.Random(args.seed + 7)
    picks = srng.sample(split["test"], SAMPLES)
    samples = [
        {"description": r.description, "amount": r.amount, "date": r.date, "category": r.category}
        for r in picks
    ]

    counts = Counter(tx.feature_blocks(feats).tolist())
    meta = {
        "seed": args.seed,
        "dataset": {
            **synth.summarize(rows),
            "split_shares": synth.SPLIT_SHARES,
            "split_unit": "merchant group",
            "brands": sum(len(v) for v in synth.BRANDS.values()),
            "categories": len(cats),
        },
        "config": {
            "model": "Multinomial logistic regression (L2, L-BFGS), temperature-scaled",
            "char_ngrams": list(tx.CHAR_NGRAMS),
            "min_df_char": MIN_DF_CHAR,
            "min_df_word": MIN_DF_WORD,
            "amount_weight": AMOUNT_WEIGHT,
            "amount_edges": list(tx.AMOUNT_EDGES),
            "C": c_best,
            "C_grid": grid,
            "temperature": temperature,
            "n_features": {
                "char": counts[0],
                "word": counts[1],
                "amount": counts[2],
                "total": len(feats),
            },
            "weights_dtype": "float16",
        },
        "metrics": {
            "model": ev,
            "keyword": rules,
            "hybrid": hybrid,
            "majority": {**naive, "category": majority},
            "no_amount": headline(no_amount),
            "ablations": ablations,
            "leakage": leakage,
        },
        "samples": samples,
    }
    art = tx.model_to_artifact(
        tx.Model(
            model.categories,
            model.labels,
            model.features,
            model.index,
            model.idf,
            model.block,
            model.coef,
            model.intercept,
            model.temperature,
            model.amount_weight,
            rounded(meta),
        )  # fmt: skip
    )
    text = json.dumps(art, sort_keys=True, indent=1, ensure_ascii=False) + "\n"
    args.out.write_text(text, encoding="utf-8")
    print(
        f"test accuracy {ev['accuracy']:.4f}, macro-F1 {ev['macro_f1']:.4f}; keywords "
        f"{rules['accuracy']:.4f}; majority {naive['accuracy']:.4f}; random split "
        f"{rep_r['accuracy']:.4f}. Wrote {args.out} ({len(text.encode()) / 1e6:.2f} MB) in "
        f"{time.perf_counter() - t0:.1f}s",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
