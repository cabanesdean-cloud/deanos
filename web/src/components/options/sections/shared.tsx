"use client";

import { LineChart, type Band, type LineSeries } from "@/components/charts/LineChart";
import { Legend } from "@/components/ui/Legend";
import { money, pathsLabel } from "@/lib/options";

/** Tick positions for a log10 axis: whole powers of ten inside the range, plus the ends if sparse. */
export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) out.push(e);
  if (out.length < 3) {
    for (let e = Math.ceil(lo * 2) / 2; e <= hi; e += 0.5) if (!out.includes(e)) out.push(e);
    out.sort((a, b) => a - b);
  }
  return out;
}

export function logLabel(v: number): string {
  return pathsLabel(Math.round(10 ** v));
}

/**
 * Monte Carlo estimate against the number of simulated paths, on a log axis,
 * with each estimator's 95% interval as a band.
 */
export function ConvergenceChart({
  paths,
  estimators,
  reference,
  referenceLabel,
  ariaLabel,
  unit = "paths",
}: {
  paths: number[];
  estimators: { id: string; label: string; mean: number[]; se: number[]; color: string; band: string }[];
  reference?: number;
  referenceLabel?: string;
  ariaLabel: string;
  unit?: string;
}) {
  const x = paths.map((n) => Math.log10(n));
  const bands: Band[] = estimators.map((e) => ({
    id: e.id,
    lower: e.mean.map((m, i) => m - 1.96 * e.se[i]),
    upper: e.mean.map((m, i) => m + 1.96 * e.se[i]),
    fill: e.band,
  }));
  const series: LineSeries[] = estimators.map((e) => ({ id: e.id, label: e.label, values: e.mean, color: e.color, width: 1.75 }));
  return (
    <>
      <Legend
        items={[
          ...estimators.flatMap((e) => [
            { label: e.label, color: e.color },
            { label: e.label + ": 95% interval", color: e.band, kind: "swatch" as const },
          ]),
          ...(reference != null && referenceLabel ? [{ label: referenceLabel, color: "var(--reference)", kind: "dashed" as const }] : []),
        ]}
      />
      <LineChart
        x={x}
        xType="linear"
        xFormat={logLabel}
        xTickValues={logTicks(x[0], x[x.length - 1])}
        series={series}
        bands={bands}
        refLines={reference != null ? [{ value: reference, label: referenceLabel }] : []}
        yFormat={money}
        height={300}
        ariaLabel={ariaLabel}
        readout={(i) => (
          <>
            <span>
              {paths[i].toLocaleString()} {unit}
            </span>
            {estimators.map((e) => (
              <span key={e.id}>
                {e.label} <b>{money(e.mean[i])}</b> ± {money(1.96 * e.se[i])}
              </span>
            ))}
          </>
        )}
      />
    </>
  );
}

/** Index of the value in a sorted grid closest to target. */
export function nearestIndex(grid: number[], target: number): number {
  let best = 0;
  for (let i = 1; i < grid.length; i++) if (Math.abs(grid[i] - target) < Math.abs(grid[best] - target)) best = i;
  return best;
}
