"use client";

import { IntervalPlot } from "@/components/charts/IntervalPlot";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { int, num, pct } from "@/lib/format";
import { labelOf } from "@/lib/transactions";

import { MetricsLoading, useMetrics } from "./shared";

export function BaselinesSection() {
  const state = useMetrics();
  if (state.status !== "ready") return <MetricsLoading state={state} />;
  const d = state.data;
  const m = d.metrics;
  const gain = m.model.interval.accuracy_gain;
  const leak = m.leakage;
  const rows = [
    { id: "majority", label: "Most common category", r: m.majority, interval: undefined },
    { id: "keyword", label: "Keyword rules", r: m.keyword, interval: m.keyword.interval },
    { id: "model", label: "Model", r: m.model, interval: m.model.interval },
    { id: "hybrid", label: "Rules first, then model", r: m.hybrid, interval: m.hybrid.interval },
  ];
  const color = (id: string) => (id === "model" ? "var(--series-1)" : id === "hybrid" ? "var(--series-2)" : "var(--reference)");

  return (
    <SectionFrame
      title="Baselines & leakage"
      stale={state.stale}
      method="transactions-evaluation"
      methodLabel="Evaluation and leakage control"
      answer={
        <>
          The model gets {pct(m.model.accuracy, 1)} of unseen merchants right, against {pct(m.keyword.accuracy, 1)} for a hand-written
          keyword list and {pct(m.majority.accuracy, 1)} for always guessing the most common category.
          {gain && (
            <>
              {" "}
              The gain over the keywords is {pct(gain[0], 0)} to {pct(gain[1], 0)} (95% interval).
            </>
          )}{" "}
          Evaluated the careless way, on a random split where test merchants also appear in training, the same pipeline scores{" "}
          {pct(leak.random_split.accuracy, 1)}.
        </>
      }
    >
      <Block
        title="Accuracy on the test merchants"
        caption={
          <>
            Whiskers are 95% bootstrap intervals that resample whole merchants, not rows: a model that misreads a brand misreads every
            one of its transactions, so rows are not independent and a row bootstrap would be too narrow. The last row applies a
            keyword rule when one matches and the model otherwise.
          </>
        }
      >
        <IntervalPlot
          rows={rows.map((r) => ({
            id: r.id,
            label: r.label,
            value: r.r.accuracy,
            low: r.interval?.accuracy[0],
            high: r.interval?.accuracy[1],
            color: color(r.id),
          }))}
          domain={[0, 1]}
          format={(v) => pct(v, 0)}
          ariaLabel="Test accuracy with 95% merchant-bootstrap intervals for the majority baseline, keyword rules, the model, and rules followed by the model"
        />
      </Block>
      <Block
        title="All headline metrics"
        caption={
          <>
            Macro-F1 averages the per-category F1 scores, so small categories count as much as large ones; weighted F1 weights them by
            size. The majority baseline always answers {labelOf(d.categories, m.majority.category)}. Keyword rules matched{" "}
            {pct(m.keyword.matched_share, 0)} of test rows; the rest fall back to the majority answer.
          </>
        }
      >
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Accuracy, macro-F1 and weighted F1 for each classifier, with 95% intervals</caption>
            <thead>
              <tr>
                <th scope="col">Classifier</th>
                <th scope="col">Accuracy</th>
                <th scope="col">95% interval</th>
                <th scope="col">Macro-F1</th>
                <th scope="col">95% interval</th>
                <th scope="col">Weighted F1</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: "var(--fg)" }}>{r.label}</td>
                  <td>{pct(r.r.accuracy, 1)}</td>
                  <td className="muted">{r.interval ? `${pct(r.interval.accuracy[0], 1)} to ${pct(r.interval.accuracy[1], 1)}` : "n/a"}</td>
                  <td>{num(r.r.macro_f1, 3)}</td>
                  <td className="muted">{r.interval ? `${num(r.interval.macro_f1[0], 3)} to ${num(r.interval.macro_f1[1], 3)}` : "n/a"}</td>
                  <td>{num(r.r.weighted_f1, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Rules first, then model, beats the model alone ({pct(m.hybrid.accuracy, 1)} against {pct(m.model.accuracy, 1)}) because the
          keyword list names well-known brands, which is exactly what the model cannot learn about a brand it has never seen. The
          rules were written by hand by someone who could read the generator&apos;s word lists, so both rule-based rows are probably
          optimistic. The model is shown alone everywhere else on this page.
        </p>
      </Block>
      <Block
        title="Leakage: why the split is by merchant"
        caption={
          <>
            Same features, same regularization, same code. The only difference is how rows were divided. In the random split{" "}
            {pct(leak.random_test_rows_with_seen_merchant, 0)} of test rows come from a merchant that also appears in training, so the
            model mostly recognizes names it memorized. The merchant split keeps every merchant (and its sister brands) in one split
            only, which is the situation a new transaction from a new shop is in.
          </>
        }
      >
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Accuracy and macro-F1 on a random row split and on the merchant split</caption>
            <thead>
              <tr>
                <th scope="col">Split</th>
                <th scope="col">Test rows</th>
                <th scope="col">Accuracy</th>
                <th scope="col">Macro-F1</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Random rows (leaky)</td>
                <td>{int(leak.random_split.n)}</td>
                <td>{pct(leak.random_split.accuracy, 1)}</td>
                <td>{num(leak.random_split.macro_f1, 3)}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--fg)" }}>By merchant (reported)</td>
                <td>{int(leak.merchant_split.n)}</td>
                <td>{pct(leak.merchant_split.accuracy, 1)}</td>
                <td>{num(leak.merchant_split.macro_f1, 3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Block>
      <Block
        title="Which features matter: ablations"
        caption={
          <>
            Each row retrains the model on a subset of the feature blocks and scores it on the same test merchants. These were run for
            the report after the model was chosen, and played no part in choosing it. Leaving the amount out at prediction time (the
            shipped model, amount missing) gives {pct(m.no_amount.accuracy, 1)}.
          </>
        }
      >
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Accuracy and macro-F1 by feature set</caption>
            <thead>
              <tr>
                <th scope="col">Features</th>
                <th scope="col">Count</th>
                <th scope="col">Accuracy</th>
                <th scope="col">Macro-F1</th>
              </tr>
            </thead>
            <tbody>
              {m.ablations.map((a) => (
                <tr key={a.features}>
                  <td style={{ color: a.features.includes("shipped") ? "var(--fg)" : undefined }}>{a.features}</td>
                  <td>{int(a.n_features)}</td>
                  <td>{pct(a.accuracy, 1)}</td>
                  <td>{num(a.macro_f1, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </SectionFrame>
  );
}
