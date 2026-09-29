"""Transaction ML: generator, features, inference, explanations, evaluation, artifact."""

from __future__ import annotations

import importlib.util
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path
from types import ModuleType

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from deanos_engine.models import transactions as tx
from deanos_engine.models import transactions_synth as synth

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "build_transactions_model.py"


@pytest.fixture(scope="module")
def model() -> tx.Model:
    return tx.load_model()


@pytest.fixture(scope="module")
def rows() -> list[synth.Transaction]:
    return synth.generate()


def _build_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("build_transactions_model", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


# ─── Generator ───────────────────────────────────────────────────────────────


def test_generator_is_deterministic() -> None:
    a = synth.generate(n=2000)
    b = synth.generate(n=2000)
    assert a == b
    assert synth.generate(seed=1, n=2000) != a


def test_generator_covers_every_category_in_every_split(rows: list[synth.Transaction]) -> None:
    summary = synth.summarize(rows)
    assert summary["rows"] == synth.DEFAULT_ROWS
    splits = summary["splits"]
    assert isinstance(splits, dict)
    assert set(splits) == {"train", "val", "test"}
    for s in splits.values():
        assert all(n > 0 for n in s["by_category"].values()), s
    assert 0.05 < float(str(summary["amount_missing_share"])) < 0.15


def test_merchant_groups_never_cross_splits(rows: list[synth.Transaction]) -> None:
    where: dict[str, set[str]] = {}
    for r in rows:
        where.setdefault(r.group, set()).add(r.split)
        where.setdefault("m:" + r.merchant, set()).add(r.split)
    assert all(len(s) == 1 for s in where.values())
    assert synth.summarize(rows)["groups_shared_across_splits"] == 0
    # Sister brands share a group, so they share a split.
    groups = {r.merchant: r.group for r in rows}
    assert groups["UBER TRIP"] == groups["UBER EATS"] == "UBER"


def test_generated_rows_look_like_statements(rows: list[synth.Transaction]) -> None:
    for r in rows:
        assert r.description.strip() == r.description and 2 <= len(r.description) <= 120
        assert r.category in synth.CATEGORY_IDS
        if r.amount is not None:
            assert r.amount != 0 and abs(r.amount) < 100_000
            if r.category == "income":
                assert r.amount > 0
            if r.category in ("fuel", "dining", "utilities", "subscriptions", "fees"):
                assert r.amount < 0
    prefixes = Counter(r.description.split("*")[0] for r in rows if "*" in r.description[:8])
    assert prefixes["SQ "] > 50 and prefixes["TST"] > 50


def test_no_private_style_identifiers_in_catalog() -> None:
    merchants = synth.build_merchants()
    assert len({m.name for m in merchants}) == len(merchants)
    assert all(m.name.isupper() or not m.name.isalpha() for m in merchants)


# ─── Features ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("STARBUCKS #1234 SEATTLE WA", "starbucks #0000 seattle wa"),
        ("Café Olé", "cafe ole"),
        ("TRADER JOE'S", "trader joes"),
        ("<script>alert(1)</script>", "script alert 0 /script"),
        ("'; DROP TABLE tx;--", "drop table tx --"),
        ("a\x00b\u200bc", "a b c"),
        ("   ", ""),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert tx.normalize(raw) == expected


def test_normalize_caps_length() -> None:
    assert len(tx.normalize("A" * 10_000)) <= tx.MAX_DESCRIPTION


def test_extract_features() -> None:
    ex = tx.extract("SQ *BLUE BAKERY", -6.5)
    assert ex.words == ["sq", "*blue", "bakery"]
    assert ex.counts["c: ba"] == 1 and ex.counts["c:ery "] == 1
    assert not any(f.startswith("c:") and " " in f[2:].strip() for f in ex.counts)  # within words
    assert {"w:sq", "w:blue", "w:bakery", "w:sq blue", "w:blue bakery"} <= set(ex.counts)
    assert {"a:debit", "a:bin1"} <= set(ex.counts)
    assert ex.origin["w:blue bakery"] == [1, 2]


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (None, ["a:missing"]),
        (-4.99, ["a:debit", "a:bin0", "a:x99"]),
        (2500.0, ["a:credit", "a:bin6", "a:round", "a:round50"]),
        (-120.0, ["a:debit", "a:bin4", "a:round"]),
        (-1_000_000.0, ["a:debit", "a:bin7", "a:round", "a:round50"]),
    ],
)
def test_amount_features(amount: float | None, expected: list[str]) -> None:
    assert tx.amount_features(amount) == expected


def test_amount_bin_labels() -> None:
    assert tx.amount_bin_label(0) == "$0 to $5"
    assert tx.amount_bin_label(7) == "$3,000 or more"


# ─── Artifact ────────────────────────────────────────────────────────────────


def test_artifact_is_small_and_loads_fast() -> None:
    assert tx.ARTIFACT_PATH.stat().st_size < 2_000_000
    t = time.perf_counter()
    with tx.ARTIFACT_PATH.open(encoding="utf-8") as fh:
        m = tx.model_from_artifact(json.load(fh))
    assert time.perf_counter() - t < 1.0
    assert m.categories == synth.CATEGORY_IDS
    assert m.coef.shape == (len(m.features), len(m.categories))
    assert m.idf.shape == (len(m.features),)
    assert np.all(np.isfinite(m.coef)) and np.all(m.idf >= 1.0)
    assert 0.2 < m.temperature < 5
    assert list(m.features) == sorted(m.features)


def test_artifact_round_trip(model: tx.Model) -> None:
    again = tx.model_from_artifact(json.loads(json.dumps(tx.model_to_artifact(model))))
    assert np.array_equal(again.coef, model.coef)
    assert np.array_equal(again.idf, model.idf)
    assert again.meta == model.meta


def test_unknown_format_is_rejected() -> None:
    with pytest.raises(ValueError):
        tx.model_from_artifact({"format": "something-else"})


# ─── Inference and explanations ──────────────────────────────────────────────


@pytest.mark.parametrize(
    ("description", "amount", "category"),
    [
        ("NETFLIX.COM 866-579-7172 CA", -15.49, "subscriptions"),
        ("TST* LUCKY NOODLE BAR", -38.2, "dining"),
        ("ZELLE TO JORDAN P", -120.0, "transfers"),
        ("ACME ROBOTICS PAYROLL PPD ID: 1234567890", 2450.0, "income"),
        ("PARKSIDE FAMILY DENTAL", -150.0, "health"),
        ("OAKWOOD APTS RENT", -2100.0, "housing"),
        ("MONTHLY MAINTENANCE FEE", -12.0, "fees"),
        ("SQ *BLUE HERON COFFEE SAN DIEGO CA", -6.75, "dining"),
        ("LYFT RIDE SAN FRANCISCO CA", -18.0, "transport"),
        ("CHEVRON 0091234 FRESNO CA", -52.3, "fuel"),
        ("DELTA AIR LINES ATLANTA GA", -412.0, "travel"),
        ("AMC THEATRES 1234 BOSTON MA", -32.0, "entertainment"),
        ("PG&E WEB ID: 1234567890", -96.0, "utilities"),
        ("SAFEWAY #1711 OAKLAND CA", -64.0, "groceries"),
        ("AMAZON.COM WA", -35.0, "shopping"),
    ],
)
def test_known_examples(model: tx.Model, description: str, amount: float, category: str) -> None:
    out = tx.categorize(model, description, amount)
    assert out["prediction"]["category"] == category, out["top"]


def test_probabilities_are_a_distribution(model: tx.Model) -> None:
    out = tx.categorize(model, "WALMART SUPERCENTER #1234", -86.4, k=14)
    probs = list(out["probabilities"].values())
    assert math.isclose(sum(probs), 1.0, abs_tol=1e-9)
    assert all(0 <= p <= 1 for p in probs)
    top = [t["probability"] for t in out["top"]]
    assert top == sorted(top, reverse=True) and len(top) == 14
    assert out["prediction"]["probability"] == top[0]


@given(st.text(min_size=1, max_size=200), st.one_of(st.none(), st.floats(-1e6, 1e6)))
@settings(max_examples=200, deadline=None)
def test_any_readable_input_gives_a_distribution(description: str, amount: float | None) -> None:
    m = tx.load_model()
    try:
        out = tx.categorize(m, description, amount, k=5)
    except tx.TransactionsError:
        assert not any(c.isalnum() for c in tx.normalize(description))
        return
    probs = np.array(list(out["probabilities"].values()))
    assert np.all(np.isfinite(probs)) and math.isclose(probs.sum(), 1.0, abs_tol=1e-9)
    assert len(out["top"]) == 5
    assert "<" not in out["input"]["normalized"] and ">" not in out["input"]["normalized"]


def test_explanation_adds_up_to_the_logit(model: tx.Model) -> None:
    """Contributions + bias reproduce the centered, temperature-scaled logit of every class."""
    d, a = "SQ *GOLDEN RAMEN SEATTLE WA", -24.5
    v = tx.vectorize(model, d, a)
    z = tx.logits(model, v) / model.temperature
    centered = z - z.mean()
    totals = np.array([tx.explain(model, v, c)["total"] for c in model.categories])
    assert np.allclose(totals, centered, atol=1e-9)
    assert np.allclose(tx.softmax(totals), tx.predict_proba(model, v), atol=1e-12)
    ex = tx.explain(model, v, "dining")
    token_sum = sum(t["contribution"] for t in ex["tokens"]) + ex["amount"]
    assert math.isclose(token_sum + ex["bias"], ex["total"], abs_tol=1e-9)
    assert [t["text"] for t in ex["tokens"]] == ["sq", "*golden", "ramen", "seattle", "wa"]
    ramen = next(t for t in ex["tokens"] if t["text"] == "ramen")
    assert ramen["contribution"] > 0.5


def test_categorize_is_deterministic(model: tx.Model) -> None:
    a = tx.categorize(model, "CHECKCARD 0914 SHELL OIL 57442 SEATTLE WA", -48.1)
    b = tx.categorize(model, "CHECKCARD 0914 SHELL OIL 57442 SEATTLE WA", -48.1)
    assert a == b


def test_case_and_accents_do_not_matter(model: tx.Model) -> None:
    a = tx.categorize(model, "CAFE LOTUS", -9.0)["probabilities"]
    b = tx.categorize(model, "café lotus", -9.0)["probabilities"]
    assert a == b


def test_amount_changes_the_answer_for_ambiguous_text(model: tx.Model) -> None:
    small = tx.categorize(model, "PAYMENT", -9.99)["probabilities"]
    large = tx.categorize(model, "PAYMENT", 2500.0)["probabilities"]
    assert small != large
    assert large["income"] > small["income"]


def test_unknown_input_has_low_coverage(model: tx.Model) -> None:
    out = tx.categorize(model, "qxzvw", None)
    assert out["coverage"]["share"] < 0.5
    assert out["prediction"]["confidence"] != "high"


@pytest.mark.parametrize(
    ("description", "amount", "fragment"),
    [
        ("", None, "letters or digits"),
        ("   ", None, "letters or digits"),
        ("!!! ??? ...", None, "letters or digits"),
        ("🙂🙂🙂", None, "letters or digits"),
        ("店铺消费", None, "letters or digits"),
        ("A" * (tx.MAX_DESCRIPTION + 1), None, "limited"),
        ("COFFEE", float("nan"), "Amounts"),
        ("COFFEE", float("inf"), "Amounts"),
        ("COFFEE", 2e6, "Amounts"),
    ],
)
def test_hostile_inputs_raise(description: str, amount: float | None, fragment: str) -> None:
    with pytest.raises(tx.TransactionsError, match=fragment):
        tx.categorize(tx.load_model(), description, amount)


@pytest.mark.parametrize(
    "description",
    ["'; DROP TABLE tx;--", "<img src=x onerror=alert(1)>", "49 {{7*7}}", "../../etc/passwd"],
)
def test_injection_strings_are_just_text(model: tx.Model, description: str) -> None:
    out = tx.categorize(model, description, None)
    assert math.isclose(sum(out["probabilities"].values()), 1.0, abs_tol=1e-9)
    assert not set("<>'\"{}$;") & set(out["input"]["normalized"])


def test_top_features_are_sensible(model: tx.Model) -> None:
    top = tx.top_features(model)
    assert set(top) == set(model.categories)
    words = {c: {f["text"] for f in v} for c, v in top.items()}
    assert "payroll" in words["income"]
    assert "fee" in words["fees"]
    assert all(f["weight"] > 0 for v in top.values() for f in v)


def test_keyword_rules() -> None:
    assert tx.keyword_rule("ZELLE TO SAM") == "transfers"
    assert tx.keyword_rule("OVERDRAFT FEE") == "fees"
    assert tx.keyword_rule("GOLDEN DRAGON PIZZA") == "dining"
    assert tx.keyword_rule("PG&E") is None
    assert {c for c, _ in tx.KEYWORD_RULES} == set(synth.CATEGORY_IDS)


# ─── Evaluation functions ────────────────────────────────────────────────────


def test_report_matches_scikit_learn() -> None:
    from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support

    rng = np.random.default_rng(3)
    y = rng.integers(0, 5, 400)
    p = np.where(rng.random(400) < 0.6, y, rng.integers(0, 5, 400))
    rep = tx.report(tx.confusion_matrix(y.tolist(), p.tolist(), 5), list("abcde"))
    prec, rec, f1, sup = precision_recall_fscore_support(y, p, labels=range(5), zero_division=0)
    assert math.isclose(rep["accuracy"], accuracy_score(y, p))
    assert math.isclose(rep["macro_f1"], f1_score(y, p, average="macro"))
    assert math.isclose(rep["weighted_f1"], f1_score(y, p, average="weighted"))
    for i, row in enumerate(rep["per_class"]):
        assert math.isclose(row["precision"], prec[i]) and math.isclose(row["recall"], rec[i])
        assert math.isclose(row["f1"], f1[i]) and row["support"] == sup[i]


def test_report_handles_empty_classes() -> None:
    rep = tx.report(tx.confusion_matrix([0, 0], [0, 0], 3), ["a", "b", "c"])
    assert rep["accuracy"] == 1.0
    assert rep["per_class"][1] == {
        "category": "b",
        "precision": 0.0,
        "recall": 0.0,
        "f1": 0.0,
        "support": 0,
    }


def test_reliability_and_ece() -> None:
    conf = np.array([0.95, 0.95, 0.55, 0.55])
    correct = np.array([True, True, True, False])
    rel = tx.reliability(conf, correct)
    assert math.isclose(rel["ece"], 0.5 * 0.05 + 0.5 * 0.05)
    assert sum(b["count"] for b in rel["bins"]) == 4
    assert rel["bins"][9]["accuracy"] == 1.0 and rel["bins"][0]["confidence"] is None
    # A calibrated forecaster has a small ECE.
    rng = np.random.default_rng(0)
    c = rng.uniform(0.3, 1.0, 50_000)
    assert tx.reliability(c, rng.random(50_000) < c)["ece"] < 0.01


def test_coverage_curve() -> None:
    conf = np.array([0.2, 0.6, 0.9, 0.99])
    correct = np.array([False, True, True, True])
    cur = {r["threshold"]: r for r in tx.coverage_curve(conf, correct, (0.0, 0.5, 1.0))}
    assert cur[0.0]["coverage"] == 1.0 and cur[0.0]["accuracy"] == 0.75
    assert cur[0.5]["coverage"] == 0.75 and cur[0.5]["accuracy"] == 1.0
    assert cur[1.0]["coverage"] == 0.0 and cur[1.0]["accuracy"] is None


def test_group_bootstrap_brackets_the_estimate() -> None:
    rng = np.random.default_rng(1)
    groups = [f"g{i // 20}" for i in range(2000)]
    y = rng.integers(0, 4, 2000).tolist()
    p = [t if rng.random() < 0.7 else (t + 1) % 4 for t in y]
    ci = tx.group_bootstrap(y, p, groups, 4, baseline_pred=[0] * 2000, n_boot=300, seed=2)
    acc = np.mean(np.array(p) == np.array(y))
    assert ci["accuracy"][0] < acc < ci["accuracy"][1]
    assert ci["accuracy_gain"][0] > 0
    assert ci == tx.group_bootstrap(y, p, groups, 4, baseline_pred=[0] * 2000, n_boot=300, seed=2)


# ─── The shipped metrics match the shipped model ─────────────────────────────


def test_metrics_match_the_artifact(model: tx.Model, rows: list[synth.Transaction]) -> None:
    test = [r for r in rows if r.split == "test"]
    items = [(r.description, r.amount) for r in test]
    y = [r.category for r in test]
    stored = model.meta["metrics"]
    ev = tx.evaluate(model, items, y)
    n = len(test)
    assert stored["model"]["n"] == n
    assert abs(ev["accuracy"] - stored["model"]["accuracy"]) <= 2 / n
    assert abs(ev["macro_f1"] - stored["model"]["macro_f1"]) < 0.005
    diff = np.abs(np.array(ev["confusion"]) - np.array(stored["model"]["confusion"])).sum()
    assert diff <= 4  # identical on the build machine; allows last-bit float differences
    assert abs(ev["calibration"]["ece"] - stored["model"]["calibration"]["ece"]) < 0.003
    majority = stored["majority"]["category"]
    rules = tx.evaluate_rules(items, y, model.categories, majority)
    assert rules["confusion"] == stored["keyword"]["confusion"]
    assert tx.evaluate_majority(y, model.categories, majority)["accuracy"] == pytest.approx(
        stored["majority"]["accuracy"], abs=1e-6
    )
    train_counts = Counter(r.category for r in rows if r.split == "train")
    assert majority == train_counts.most_common(1)[0][0]


def test_reported_results_are_coherent(model: tx.Model) -> None:
    m = model.meta["metrics"]
    acc = m["model"]["accuracy"]
    lo, hi = m["model"]["interval"]["accuracy"]
    assert lo < acc < hi
    assert acc > m["keyword"]["accuracy"] > m["majority"]["accuracy"]
    assert m["leakage"]["random_split"]["accuracy"] > acc  # leakage flatters
    assert m["leakage"]["random_test_rows_with_seen_merchant"] > 0.95
    shipped = m["ablations"][-1]
    assert shipped["accuracy"] == pytest.approx(acc, abs=1e-6)
    assert m["model"]["calibration"]["ece"] <= m["model"]["calibration_uncalibrated"]["ece"]
    assert sum(r["rows"] for r in m["model"]["by_merchant_kind"]) == m["model"]["n"]


def test_dataset_summary_matches_generator(model: tx.Model, rows: list[synth.Transaction]) -> None:
    stored = model.meta["dataset"]
    fresh = synth.summarize(rows)
    assert stored["rows"] == fresh["rows"]
    assert stored["splits"] == fresh["splits"]
    assert stored["groups_shared_across_splits"] == 0


def test_samples_are_held_out_rows(model: tx.Model, rows: list[synth.Transaction]) -> None:
    test = {(r.description, r.amount, r.category) for r in rows if r.split == "test"}
    samples = model.meta["samples"]
    assert len(samples) >= 20
    assert all((s["description"], s["amount"], s["category"]) in test for s in samples)


def test_presets_are_readable(model: tx.Model) -> None:
    held = synth.assign_splits(synth.build_merchants())
    for d, a, note in tx.PRESETS:
        tx.categorize(model, d, a)
        if "held out" in note or "held-out" in note:
            brand = d.split(" #")[0].replace("CHECKCARD 0914 ", "").split(" 0")[0]
            name = next(
                m for m in synth.build_merchants() if m.kind == "brand" and brand.startswith(m.name)
            )
            assert held[name.group] in ("val", "test"), d
        if "seen in training" in note:
            brand = d.split(".COM")[0].split(" *")[0]
            name = next(
                m for m in synth.build_merchants() if m.kind == "brand" and m.name.startswith(brand)
            )
            assert held[name.group] == "train", d


# ─── Training is reproducible ────────────────────────────────────────────────


def test_training_pipeline_is_deterministic() -> None:
    build = _build_module()
    small = [r for r in synth.generate(n=3000) if r.split == "train"]
    exs = [tx.extract(r.description, r.amount) for r in small]
    y = [synth.CATEGORY_IDS.index(r.category) for r in small]

    def once() -> np.ndarray:
        feats, idf = build.fit_vocab(exs)
        clf = build.fit(build.design(exs, feats, idf), y, 10.0)
        return np.asarray(clf.coef_)

    assert np.array_equal(once(), once())
