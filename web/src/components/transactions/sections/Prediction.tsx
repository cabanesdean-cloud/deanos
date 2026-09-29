"use client";

import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Legend } from "@/components/ui/Legend";
import { Notice } from "@/components/ui/States";
import { apiUrl } from "@/lib/api";
import { pct } from "@/lib/format";
import { type Categorized, type Feature, money } from "@/lib/transactions";

import type { TxSectionProps } from "../TransactionsExplorer";
import { Bar, shade, signed } from "./shared";

const CONFIDENCE: Record<string, string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence",
};

export function PredictionSection({ inputs }: TxSectionProps) {
  const url = apiUrl("transactions/categorize", { d: inputs.d, a: inputs.a ?? undefined, k: 5 });
  const state = useApi<Categorized>(url);
  return (
    <Loaded state={state} title="Prediction">
      {(d, stale) => {
        const p = d.prediction;
        const runner = d.top[1];
        const ex = d.explanation;
        const maxAbs = Math.max(0.01, ...ex.tokens.map((t) => Math.abs(t.contribution)), Math.abs(ex.amount));
        const lowCoverage = d.coverage.text_features > 0 && d.coverage.share < 0.5;
        return (
          <SectionFrame
            title="Prediction"
            stale={stale}
            method="transactions-model"
            methodLabel="Features and model"
            answer={
              <>
                Most likely <b>{p.label}</b>, with a calibrated probability of {pct(p.probability, 0)} ({CONFIDENCE[p.confidence]}).
                {runner && (
                  <>
                    {" "}
                    The runner-up is {runner.label} at {pct(runner.probability, 0)}.
                  </>
                )}
              </>
            }
          >
            {lowCoverage && (
              <Notice>
                Only {pct(d.coverage.share, 0)} of this text&apos;s character patterns appear in the training data, so the model is
                mostly guessing from format and amount. Treat the answer with caution.
              </Notice>
            )}
            <Block
              title="Top five categories"
              caption="Probabilities after temperature scaling, which was fitted on merchants held out of training so that a stated 80% is right about 80% of the time. They cover all 14 categories and sum to 100%."
            >
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <caption className="visually-hidden">Most likely categories and their probabilities</caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Probability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.top.map((t, i) => (
                      <tr key={t.category}>
                        <td style={{ color: i === 0 ? "var(--fg)" : undefined, fontWeight: i === 0 ? 500 : undefined }}>{t.label}</td>
                        <td>
                          {pct(t.probability, 1)}
                          <Bar value={t.probability} color={i === 0 ? "var(--series-1)" : "var(--reference)"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
            <Block
              title={"Why " + p.label}
              caption={
                <>
                  Each word&apos;s number is how far it moved the score for {p.label} relative to the average category (the
                  log-odds contributions of its character n-grams and word features). Blue pushes toward {p.label}, orange
                  away. The words are the model&apos;s normalized view of the text: lowercase, accents removed, digits shown as 0.
                </>
              }
            >
              <Legend
                items={[
                  { label: "Pushes toward " + p.label, color: "color-mix(in srgb, var(--series-1) 45%, transparent)", kind: "swatch" },
                  { label: "Pushes away", color: "color-mix(in srgb, var(--series-2) 45%, transparent)", kind: "swatch" },
                ]}
              />
              <ol className="tx-tokens" aria-label={"Contribution of each word to " + p.label}>
                {ex.tokens.map((t, i) => (
                  <li key={i} style={{ background: shade(t.contribution, maxAbs) }}>
                    <span className="tx-tokens__text">{t.text}</span>
                    <span className="tx-tokens__value">{signed(t.contribution)}</span>
                  </li>
                ))}
                <li style={{ background: shade(ex.amount, maxAbs) }}>
                  <span className="tx-tokens__text">amount {money(d.input.amount)}</span>
                  <span className="tx-tokens__value">{signed(ex.amount)}</span>
                </li>
              </ol>
              <p className="small muted" style={{ marginTop: 12 }}>
                Starting point for {p.label} (its bias) {signed(ex.bias)}; total score {signed(ex.total)}. The category with the
                highest total wins, and the softmax of the totals gives the probabilities above.
              </p>
            </Block>
            <Block title="Strongest individual features" caption="The single features with the largest effect on this prediction, in either direction. Character n-grams show spaces as a middle dot (·), which marks the start or end of a word.">
              <FeatureTable rows={ex.features} label={p.label} />
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}

function FeatureTable({ rows, label }: { rows: Feature[]; label: string }) {
  const kind = { char: "Character n-gram", word: "Word", amount: "Amount" } as const;
  return (
    <div className="table-wrap" tabIndex={0}>
      <table className="table">
        <caption className="visually-hidden">Features with the largest effect on the score for {label}</caption>
        <thead>
          <tr>
            <th scope="col">Feature</th>
            <th scope="col" className="left">
              Type
            </th>
            <th scope="col">Effect on {label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.feature}>
              <td style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{f.display}</td>
              <td className="left">{kind[f.kind]}</td>
              <td className={f.contribution >= 0 ? "" : "muted"}>{signed(f.contribution)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
