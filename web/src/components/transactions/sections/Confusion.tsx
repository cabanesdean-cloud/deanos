"use client";

import { useState } from "react";

import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Segmented } from "@/components/ui/Controls";
import { int, pct } from "@/lib/format";
import { labelOf } from "@/lib/transactions";

import { MetricsLoading, short, useMetrics } from "./shared";

type Which = "model" | "keyword";

/** Largest off-diagonal cells: the mistakes that happen most. */
function topMistakes(m: number[][], n = 3) {
  const out: { t: number; p: number; count: number; share: number }[] = [];
  m.forEach((row, t) => {
    const total = row.reduce((a, b) => a + b, 0) || 1;
    row.forEach((count, p) => {
      if (p !== t && count > 0) out.push({ t, p, count, share: count / total });
    });
  });
  return out.sort((a, b) => b.count - a.count).slice(0, n);
}

export function ConfusionSection() {
  const state = useMetrics();
  const [which, setWhich] = useState<Which>("model");
  // Touch has no hover titles: a tapped cell is described under the matrix instead.
  const [cell, setCell] = useState<{ i: number; j: number } | null>(null);
  if (state.status !== "ready") return <MetricsLoading state={state} />;
  const d = state.data;
  const cats = d.categories;
  const m = which === "model" ? d.metrics.model.confusion : d.metrics.keyword.confusion;
  const mistakes = topMistakes(d.metrics.model.confusion);
  const first = mistakes[0];
  const name = (i: number) => cats[i]?.label ?? String(i);

  return (
    <SectionFrame
      title="Confusion matrix"
      stale={state.stale}
      method="transactions-evaluation"
      methodLabel="Evaluation and leakage control"
      answer={
        <>
          On {int(d.metrics.model.n)} test transactions from {int(d.metrics.model.test_merchant_groups)} merchants it never saw in
          training, the model puts {pct(d.metrics.model.accuracy, 1)} in the right category.
          {first && (
            <>
              {" "}
              Its most common mistake is labeling {name(first.t)} as {name(first.p)} ({int(first.count)} rows, {pct(first.share, 0)} of{" "}
              {name(first.t)}).
            </>
          )}
        </>
      }
    >
      <Block
        title="Actual category (rows) against predicted category (columns)"
        caption={
          <>
            Each row is one true category; its cells count where those transactions were sent. Shading is the share of the row, so
            a dark diagonal means high recall and dark cells off it are systematic mistakes. Column headers are abbreviated;{" "}
            <span className="hint-hover">hover or focus one for the full name.</span>
            <span className="hint-touch">tap a cell for the full names.</span> The keyword baseline sends everything its rules miss to {labelOf(cats, d.metrics.majority.category)}{" "}
            (the most common training category), which is the dark column in its matrix.
          </>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Segmented<Which>
            label="Classifier"
            value={which}
            onChange={setWhich}
            options={[
              { value: "model", label: "Model" },
              { value: "keyword", label: "Keyword rules" },
            ]}
          />
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Confusion matrix">
          <table className="table tx-matrix">
            <caption className="visually-hidden">
              Confusion matrix for the {which === "model" ? "model" : "keyword rules"}: rows are actual categories, columns
              predicted categories, cells are counts of test transactions.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Actual <span aria-hidden>↓</span> / predicted <span aria-hidden>→</span>
                </th>
                {cats.map((c) => (
                  <th key={c.id} scope="col">
                    {short(c)}
                  </th>
                ))}
                <th scope="col">Rows</th>
              </tr>
            </thead>
            <tbody>
              {m.map((row, i) => {
                const total = row.reduce((a, b) => a + b, 0);
                return (
                  <tr key={cats[i].id}>
                    <th scope="row" className="left" style={{ color: "var(--fg)", fontWeight: 400 }}>
                      {cats[i].label}
                    </th>
                    {row.map((v, j) => {
                      const share = total ? v / total : 0;
                      const color = i === j ? "var(--series-1)" : "var(--series-2)";
                      return (
                        <td
                          key={j}
                          onClick={() => setCell({ i, j })}
                          title={`${cats[i].label} predicted as ${cats[j].label}: ${v} of ${total}`}
                          style={{
                            background: v ? `color-mix(in srgb, ${color} ${Math.round(8 + share * 52)}%, transparent)` : undefined,
                            color: v ? "var(--fg)" : "var(--fg-3)",
                          }}
                        >
                          {v ? int(v) : "·"}
                        </td>
                      );
                    })}
                    <td className="muted">{int(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="touch-only cell-readout" aria-live="polite">
          {cell && m[cell.i] ? (
            <>
              {name(cell.i)} predicted as {name(cell.j)}: <b>{int(m[cell.i][cell.j])}</b> of{" "}
              {int(m[cell.i].reduce((a, b) => a + b, 0))} ({which === "model" ? "model" : "keyword rules"})
            </>
          ) : (
            <span className="faint">Tap a cell to read it. Swipe the table sideways for more columns.</span>
          )}
        </p>
      </Block>
      <Block
        title="Most frequent mistakes (model)"
        caption="Nearly all of these are well-known brands the model never saw in training. A brand name carries no category words, so the model falls back on the descriptor's shape (a chain's store number and city) and the amount, which grocery chains, big-box stores and fuel stations share. Local businesses, whose names usually include words like market, grill or dental, are almost never wrong."
      >
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">The model&apos;s most frequent mistakes</caption>
            <thead>
              <tr>
                <th scope="col">Actual</th>
                <th scope="col" className="left">
                  Predicted as
                </th>
                <th scope="col">Rows</th>
                <th scope="col">Share of actual</th>
              </tr>
            </thead>
            <tbody>
              {topMistakes(d.metrics.model.confusion, 6).map((x) => (
                <tr key={x.t + ":" + x.p}>
                  <td>{name(x.t)}</td>
                  <td className="left">{name(x.p)}</td>
                  <td>{int(x.count)}</td>
                  <td>{pct(x.share, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </SectionFrame>
  );
}
