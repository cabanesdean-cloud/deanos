"use client";

import { Notice, Skeleton } from "@/components/ui/States";
import { apiUrl, useApi } from "@/lib/api";
import { int, num, pct } from "@/lib/format";
import { KIND_LABELS, labelOf, type Metrics } from "@/lib/transactions";

export type TxKind = "tx-data" | "tx-model" | "tx-eval" | "tx-limits";

function Table({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption: string }) {
  return (
    <div className="table-wrap" tabIndex={0}>
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i === 0 ? "left" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "left" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Live figures for the Transaction ML methodology pages, from the engine's metrics endpoint. */
export function TxValidationTable({ kind }: { kind: TxKind }) {
  const state = useApi<Metrics>(apiUrl("transactions/metrics"));
  if (state.status === "loading") return <Skeleton height={160} />;
  if (state.status === "error") return <Notice>Live results could not load: {state.error.message}</Notice>;
  const d = state.data;
  const m = d.metrics;
  const ds = d.dataset;

  if (kind === "tx-data") {
    const splits = (["train", "val", "test"] as const).map((s) => [
      s === "val" ? "Validation" : s === "train" ? "Training" : "Test",
      int(ds.splits[s].rows),
      int(ds.splits[s].merchants),
      int(ds.splits[s].merchant_groups),
    ]);
    return (
      <>
        <Table
          caption="Rows, merchants and merchant groups in each split"
          head={["Split", "Transactions", "Merchants", "Merchant groups"]}
          rows={splits}
        />
        <p className="small" style={{ marginTop: 12 }}>
          {int(ds.rows)} transactions in {int(ds.categories)} categories, {int(ds.brands)} brand names. Merchant groups shared across
          splits: <b>{int(ds.groups_shared_across_splits)}</b>. Rows without an amount: {pct(ds.amount_missing_share, 0)}.
        </p>
        <div style={{ marginTop: 16 }}>
          <Table
            caption="Test transactions per category"
            head={["Category", "Training rows", "Test rows"]}
            rows={d.categories.map((c) => [c.label, int(ds.splits.train.by_category[c.id] ?? 0), int(ds.splits.test.by_category[c.id] ?? 0)])}
          />
        </div>
      </>
    );
  }

  if (kind === "tx-model") {
    const c = d.config;
    return (
      <>
        <Table
          caption="Regularization strength chosen on validation merchants"
          head={["C (inverse regularization)", "Validation macro-F1", "Validation log loss"]}
          rows={c.C_grid.map((g) => [(g.C === c.C ? "▸ " : "") + num(g.C, 0), num(g.val_macro_f1, 4), num(g.val_log_loss, 4)])}
        />
        <p className="small" style={{ marginTop: 12 }}>
          Chosen C = {num(c.C, 0)} (highest validation macro-F1). Features: {int(c.n_features.char)} character n-grams,{" "}
          {int(c.n_features.word)} words and word pairs, {int(c.n_features.amount)} amount flags ({int(c.n_features.total)} in all).
          Temperature T = {num(c.temperature, 4)}. Weights stored as {c.weights_dtype}.
        </p>
        <div style={{ marginTop: 16 }}>
          <Table
            caption="Ablations: test accuracy and macro-F1 by feature set"
            head={["Features", "Count", "Test accuracy", "Test macro-F1"]}
            rows={m.ablations.map((a) => [a.features, int(a.n_features), pct(a.accuracy, 1), num(a.macro_f1, 3)])}
          />
        </div>
      </>
    );
  }

  if (kind === "tx-eval") {
    const iv = (x?: [number, number], f: (v: number) => string = (v) => pct(v, 1)) => (x ? `${f(x[0])} to ${f(x[1])}` : "n/a");
    return (
      <>
        <Table
          caption="Test metrics for the model and the baselines"
          head={["Classifier", "Accuracy", "95% interval", "Macro-F1", "ECE"]}
          rows={[
            [`Majority (${labelOf(d.categories, m.majority.category)})`, pct(m.majority.accuracy, 1), "n/a", num(m.majority.macro_f1, 3), "n/a"],
            ["Keyword rules", pct(m.keyword.accuracy, 1), iv(m.keyword.interval.accuracy), num(m.keyword.macro_f1, 3), "n/a"],
            ["Model", pct(m.model.accuracy, 1), iv(m.model.interval.accuracy), num(m.model.macro_f1, 3), pct(m.model.calibration.ece, 1)],
            ["Model before temperature scaling", "same", "", "same", pct(m.model.calibration_uncalibrated.ece, 1)],
            ["Rules first, then model", pct(m.hybrid.accuracy, 1), iv(m.hybrid.interval.accuracy), num(m.hybrid.macro_f1, 3), "n/a"],
          ]}
        />
        <p className="small" style={{ marginTop: 12 }}>
          Paired gain of the model over the keyword rules (same merchant resamples): {iv(m.model.interval.accuracy_gain)}. Log loss{" "}
          {num(m.model.log_loss, 3)} ({num(m.model.log_loss_uncalibrated, 3)} before scaling); right answer in the top three{" "}
          {pct(m.model.top3_accuracy, 1)}.
        </p>
        <div style={{ marginTop: 16 }}>
          <Table
            caption="Leakage check: random row split against merchant split"
            head={["Split", "Test rows", "Accuracy", "Macro-F1"]}
            rows={[
              ["Random rows (leaky)", int(m.leakage.random_split.n), pct(m.leakage.random_split.accuracy, 1), num(m.leakage.random_split.macro_f1, 3)],
              ["By merchant (reported)", int(m.leakage.merchant_split.n), pct(m.leakage.merchant_split.accuracy, 1), num(m.leakage.merchant_split.macro_f1, 3)],
            ]}
          />
          <p className="xsmall muted" style={{ marginTop: 8 }}>
            In the random split, {pct(m.leakage.random_test_rows_with_seen_merchant, 0)} of test rows come from merchants also in training.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Table
        caption="Test accuracy by merchant type"
        head={["Merchant type", "Test rows", "Accuracy"]}
        rows={[...m.model.by_merchant_kind].sort((a, b) => b.rows - a.rows).map((k) => [KIND_LABELS[k.kind] ?? k.kind, int(k.rows), pct(k.accuracy, 1)])}
      />
      <p className="small" style={{ marginTop: 12 }}>
        Without the amount (description only): {pct(m.no_amount.accuracy, 1)} accuracy, macro-F1 {num(m.no_amount.macro_f1, 3)}, against{" "}
        {pct(m.model.accuracy, 1)} and {num(m.model.macro_f1, 3)} with it.
      </p>
      <div style={{ marginTop: 16 }}>
        <Table
          caption="Coverage and accuracy at each confidence threshold"
          head={["Confidence at least", "Share of test rows", "Accuracy on those"]}
          rows={m.model.coverage.map((c) => [c.threshold === 0 ? "Any" : pct(c.threshold, 0), pct(c.coverage, 1), pct(c.accuracy, 1)])}
        />
      </div>
    </>
  );
}
