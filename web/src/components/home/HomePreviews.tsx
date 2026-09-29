"use client";

import Link from "next/link";
import { useEffect } from "react";

import { LineChart } from "@/components/charts/LineChart";
import { Scatter } from "@/components/charts/Scatter";
import { horizonLabel, horizonTicks } from "@/components/charts/axes";
import { Legend } from "@/components/ui/Legend";
import { SlowNote } from "@/components/ui/States";
import { apiUrl, useApi, warmEngine } from "@/lib/api";
import { apiParams, BETA_DEFAULTS, type BetaResult } from "@/lib/beta";
import { date, num, trimNum, usd } from "@/lib/format";
import { DEFAULT_SPEC } from "@/lib/portfolio";
import type { Simulation } from "@/lib/types";

/** One /health request per page load, so the engine is awake by the time a visitor opens a tool. */
export function EngineWarmup() {
  useEffect(() => warmEngine(), []);
  return null;
}

const pctTick = (v: number) => `${trimNum(v * 100, 1)}%`;

/** Live preview: the tracker's default example (same request as the tracker page, so they share the cache). */
export function TrackerPreview() {
  const res = useApi<BetaResult>(apiUrl("beta", apiParams(BETA_DEFAULTS)));
  if (res.status === "error")
    return <p className="small muted">The live preview could not load. The tracker itself will retry when you open it.</p>;
  if (res.status === "loading")
    return (
      <div aria-busy="true" aria-label="Loading preview">
        <div className="skeleton preview-skeleton" />
        <SlowNote loading />
      </div>
    );
  const d = res.data;
  const c = d.quadratic.curve;
  return (
    <figure className="figure preview-figure">
      <Scatter
        preview
        x={d.scatter.benchmark}
        y={d.scatter.asset}
        lines={[
          { id: "lin", label: "Straight line", x: c.benchmark_return, y: c.linear_fitted_return, color: "var(--reference)", dash: "6 4" },
          { id: "quad", label: "Quadratic fit", x: c.benchmark_return, y: c.fitted_return, color: "var(--series-2)", width: 2.5 },
        ]}
        format={pctTick}
        xLabel={`${d.benchmark.ticker} return`}
        yLabel={`${d.asset.ticker} return`}
        height={220}
        ariaLabel={`Daily returns of ${d.asset.ticker} against ${d.benchmark.ticker}, with a straight-line beta of ${num(d.linear.beta.estimate)} and a quadratic fit.`}
        readout={() => null}
      />
      <figcaption className="xsmall muted">
        Live result: {d.asset.ticker} daily returns against {d.benchmark.ticker}, {date(d.data_quality.start)} to{" "}
        {date(d.data_quality.end)}. Straight-line beta {num(d.linear.beta.estimate)}.
      </figcaption>
    </figure>
  );
}

/** Live preview: DeanOS's Balanced example, one year of simulated outcomes (same request as the DeanOS landing chart). */
export function DeanosPreview() {
  const res = useApi<Simulation>(apiUrl("simulation", { p: DEFAULT_SPEC }));
  if (res.status === "error") return <p className="small muted">The live preview could not load.</p>;
  if (res.status === "loading") return <div className="skeleton preview-skeleton" aria-hidden />;
  const f = res.data.fan;
  return (
    <figure className="figure preview-figure">
      <Legend
        items={[
          { label: "Middle 90% of simulated paths", color: "var(--band-outer)", kind: "swatch" },
          { label: "Median", color: "var(--series-1)" },
        ]}
      />
      <LineChart
        x={f.days}
        xType="linear"
        xFormat={horizonLabel}
        xTickValues={horizonTicks(f.days[f.days.length - 1])}
        series={[{ id: "p50", label: "Median", values: f.p50, color: "var(--series-1)" }]}
        bands={[
          { id: "outer", lower: f.p5, upper: f.p95, fill: "var(--band-outer)" },
          { id: "inner", lower: f.p25, upper: f.p75, fill: "var(--band-inner)" },
        ]}
        yFormat={(v) => usd(v)}
        height={180}
        ariaLabel="One year of simulated values for $10,000 in the Balanced example portfolio."
      />
      <figcaption className="xsmall muted">
        Live result: $10,000 in the Balanced example portfolio, one year of simulated outcomes. Prices as of {date(res.data.as_of)}.
      </figcaption>
    </figure>
  );
}

export function ProjectLinks({ tool, toolLabel, method, methodLabel = "Methodology" }: { tool: string; toolLabel: string; method: string; methodLabel?: string }) {
  return (
    <div className="project-card__links">
      <Link className="button button--primary button--small" href={tool as never}>
        {toolLabel}
      </Link>
      <Link className="project-card__method" href={method as never}>
        {methodLabel}
      </Link>
    </div>
  );
}
