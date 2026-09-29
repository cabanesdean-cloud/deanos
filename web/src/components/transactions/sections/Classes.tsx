"use client";

import { useId, useState } from "react";

import { Dumbbell } from "@/components/charts/Dumbbell";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { int, num, pct } from "@/lib/format";
import { KIND_LABELS, labelOf } from "@/lib/transactions";

import { Bar, MetricsLoading, useMetrics } from "./shared";

export function ClassesSection() {
  const state = useMetrics();
  const selectId = useId();
  const [cat, setCat] = useState<string | null>(null);
  if (state.status !== "ready") return <MetricsLoading state={state} />;
  const d = state.data;
  const cats = d.categories;
  const rows = [...d.metrics.model.per_class].sort((a, b) => b.f1 - a.f1);
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const kinds = d.metrics.model.by_merchant_kind;
  const brand = kinds.find((k) => k.kind === "brand");
  const local = kinds.find((k) => k.kind === "local");
  const selected = cat ?? worst.category;
  const feats = d.top_features[selected] ?? [];

  return (
    <SectionFrame
      title="Per-class results"
      stale={state.stale}
      method="transactions-evaluation"
      methodLabel="Evaluation and leakage control"
      answer={
        <>
          Macro-F1, the average of the 14 per-category F1 scores, is {num(d.metrics.model.macro_f1, 3)}. It ranges from{" "}
          {num(best.f1, 2)} for {labelOf(cats, best.category)} to {num(worst.f1, 2)} for {labelOf(cats, worst.category)}.
          {brand && local && (
            <>
              {" "}
              The split that matters most is the merchant type: {pct(local.accuracy, 0)} right on local businesses, {pct(brand.accuracy, 0)}{" "}
              on brands the model never saw.
            </>
          )}
        </>
      }
    >
      <Block
        title="Recall and precision by category"
        caption="Recall: of the transactions that really are in a category, the share the model found. Precision: of the transactions it put in a category, the share that belong there. A category with high recall and low precision is where the model dumps transactions it is unsure about."
      >
        <Dumbbell
          rows={rows.map((r) => ({
            id: r.category,
            label: labelOf(cats, r.category),
            a: r.recall,
            b: r.precision,
            note: <>F1 {num(r.f1, 2)} on {int(r.support)} test rows</>,
          }))}
          aLabel="Recall"
          bLabel="Precision"
          format={(v) => pct(v, 0)}
          ariaLabel="Recall and precision for each of the 14 categories on the test set"
        />
      </Block>
      <Block title="Per-category table" caption="Support is the number of test transactions in the category. Sorted by F1, the harmonic mean of precision and recall.">
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Precision, recall, F1 and support for each category</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Precision</th>
                <th scope="col">Recall</th>
                <th scope="col">F1</th>
                <th scope="col">Support</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category}>
                  <td style={{ color: "var(--fg)" }}>{labelOf(cats, r.category)}</td>
                  <td>{pct(r.precision, 1)}</td>
                  <td>{pct(r.recall, 1)}</td>
                  <td>
                    {num(r.f1, 3)}
                    <Bar value={r.f1} />
                  </td>
                  <td>{int(r.support)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      <Block
        title="Accuracy by merchant type"
        caption="Local businesses are generated from generic words (market, grill, dental), which carry over to new names. A national brand is just a name: the model can only place a new one from its format and amount."
      >
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Test accuracy by merchant type</caption>
            <thead>
              <tr>
                <th scope="col">Merchant type</th>
                <th scope="col">Test rows</th>
                <th scope="col">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {[...kinds]
                .sort((a, b) => b.rows - a.rows)
                .map((k) => (
                  <tr key={k.kind}>
                    <td>{KIND_LABELS[k.kind] ?? k.kind}</td>
                    <td>{int(k.rows)}</td>
                    <td>
                      {pct(k.accuracy, 1)}
                      <Bar value={k.accuracy} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Block>
      <Block
        title="What the model learned for each category"
        caption="The words and amount flags with the largest weights for the chosen category, measured against the average category (the same centering the explanations use). Character n-grams carry much of the model's weight too but are left out here because they are hard to read. Brand names rank high because they are the most reliable signal for brands seen in training."
      >
        <div className="field" style={{ marginBottom: 12, maxWidth: 280 }}>
          <label htmlFor={selectId} className="small muted">
            Category
          </label>
          <select id={selectId} className="select" value={selected} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Strongest features for {labelOf(cats, selected)}</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col" className="left">
                  Type
                </th>
                <th scope="col">Weight</th>
              </tr>
            </thead>
            <tbody>
              {feats.map((f) => (
                <tr key={f.feature}>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{f.display}</td>
                  <td className="left">{f.kind === "char" ? "Character n-gram" : f.kind === "word" ? "Word" : "Amount"}</td>
                  <td>{num(f.weight, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </SectionFrame>
  );
}
