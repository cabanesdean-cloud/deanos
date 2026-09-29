"use client";

import { Reliability } from "@/components/charts/Reliability";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { int, num, pct } from "@/lib/format";

import { MetricsLoading, useMetrics } from "./shared";

export function CalibrationSection() {
  const state = useMetrics();
  if (state.status !== "ready") return <MetricsLoading state={state} />;
  const d = state.data;
  const mm = d.metrics.model;
  const cal = mm.calibration;
  const raw = mm.calibration_uncalibrated;
  const top = cal.bins[cal.bins.length - 1];
  const at90 = mm.coverage.find((c) => c.threshold === 0.9);
  // The bin where stated confidence most exceeds accuracy (with enough rows to matter).
  const worst = cal.bins
    .filter((b) => b.count >= 50 && b.confidence !== null && b.accuracy !== null)
    .sort((a, b) => (b.confidence! - b.accuracy!) - (a.confidence! - a.accuracy!))[0];

  return (
    <SectionFrame
      title="Calibration"
      stale={state.stale}
      method="transactions-evaluation"
      methodLabel="Evaluation and leakage control"
      answer={
        <>
          When the model says it is sure, it is: {pct(top.count / mm.n, 0)} of test predictions carry 90% or more, and{" "}
          {pct(top.accuracy, 1)} of those are right. Across all predictions the expected calibration error is {pct(cal.ece, 1)}{" "}
          after temperature scaling, down from {pct(raw.ece, 1)}.
        </>
      }
    >
      <StatGrid>
        <Stat label="Expected calibration error" value={pct(cal.ece, 1)} range={<>before scaling {pct(raw.ece, 1)}</>} />
        <Stat label="Log loss" value={num(mm.log_loss, 3)} range={<>before scaling {num(mm.log_loss_uncalibrated, 3)}</>} />
        <Stat label="Temperature" value={num(d.config.temperature, 2)} range="fitted on validation merchants" />
        <Stat label="Right answer in top three" value={pct(mm.top3_accuracy, 1)} range={<>top one {pct(mm.accuracy, 1)}</>} />
      </StatGrid>
      <Block
        title="Reliability diagram"
        caption={
          <>
            Test predictions grouped into ten confidence bins (0-10%, 10-20%, ...). A dot on the dashed diagonal means the stated
            probability matched the share that turned out right. Dot area is the number of predictions in the bin. Expected
            calibration error is the row-weighted average gap between the two.
            {worst && (
              <>
                {" "}
                The largest gap is in the {pct(worst.lower, 0)}-{pct(worst.upper, 0)} bin: stated {pct(worst.confidence, 0)}, right{" "}
                {pct(worst.accuracy, 0)} of {int(worst.count)} times. Temperature scaling divides every score by one number, so it can
                fix overconfidence on average but not a gap that differs from bin to bin.
              </>
            )}
          </>
        }
      >
        <Reliability
          series={[
            { id: "cal", label: "After temperature scaling", color: "var(--series-1)", bins: cal.bins },
            { id: "raw", label: "Before", color: "var(--series-2)", hollow: true, bins: raw.bins },
          ]}
          format={(v) => pct(v, 0)}
          ariaLabel={`Reliability diagram. Expected calibration error ${pct(cal.ece, 1)} after temperature scaling, ${pct(raw.ece, 1)} before.`}
        />
        <div className="table-wrap" tabIndex={0} style={{ marginTop: 16 }}>
          <table className="table">
            <caption className="visually-hidden">Reliability bins after temperature scaling</caption>
            <thead>
              <tr>
                <th scope="col">Confidence bin</th>
                <th scope="col">Predictions</th>
                <th scope="col">Mean confidence</th>
                <th scope="col">Share right</th>
              </tr>
            </thead>
            <tbody>
              {cal.bins
                .filter((b) => b.count > 0)
                .map((b) => (
                  <tr key={b.lower}>
                    <td>
                      {pct(b.lower, 0)} to {pct(b.upper, 0)}
                    </td>
                    <td>{int(b.count)}</td>
                    <td>{pct(b.confidence, 1)}</td>
                    <td>{pct(b.accuracy, 1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Block>
      <Block
        title="Confidence thresholds: automate the sure ones"
        caption={
          <>
            A budgeting app could file a transaction automatically only when the model is confident, and ask about the rest. Each
            row is one threshold: the share of test transactions at or above it, and how accurate those are.
            {at90 && (
              <>
                {" "}
                At 90%, {pct(at90.coverage, 0)} are filed automatically with {pct(at90.accuracy, 1)} accuracy.
              </>
            )}
          </>
        }
      >
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Coverage and accuracy at each confidence threshold</caption>
            <thead>
              <tr>
                <th scope="col">Confidence at least</th>
                <th scope="col">Share of transactions</th>
                <th scope="col">Accuracy on those</th>
              </tr>
            </thead>
            <tbody>
              {mm.coverage.map((c) => (
                <tr key={c.threshold}>
                  <td>{c.threshold === 0 ? "Any (all predictions)" : pct(c.threshold, 0)}</td>
                  <td>{pct(c.coverage, 1)}</td>
                  <td>{pct(c.accuracy, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </SectionFrame>
  );
}
