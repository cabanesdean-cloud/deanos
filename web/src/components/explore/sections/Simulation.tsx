"use client";

import { useState } from "react";

import { Histogram } from "@/components/charts/Histogram";
import { horizonLabel, horizonTicks } from "@/components/charts/axes";
import { LineChart } from "@/components/charts/LineChart";
import { Segmented } from "@/components/ui/Controls";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { pct, plural, usd } from "@/lib/format";
import type { Simulation } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, useApi } from "./shared";

type Horizon = "252" | "756" | "1260";
type Mean = "historical" | "zero";
type BlockLen = "1" | "5" | "21" | "63";

export function SimulationSection({ spec }: SectionProps) {
  const [horizon, setHorizon] = useState<Horizon>("252");
  const [mean, setMean] = useState<Mean>("historical");
  const [block, setBlock] = useState<BlockLen>("21");
  const state = useApi<Simulation>(apiUrl("simulation", { p: spec, horizon, mean, block }));
  const yearsN = Number(horizon) / 252;

  const controls = (
    <div className="controls">
      <Segmented
        label="Horizon"
        value={horizon}
        onChange={setHorizon}
        options={[
          { value: "252", label: "1 year" },
          { value: "756", label: "3 years" },
          { value: "1260", label: "5 years" },
        ]}
      />
      <Segmented
        label="Expected return"
        value={mean}
        onChange={setMean}
        options={[
          { value: "historical", label: "Historical" },
          { value: "zero", label: "Zero" },
        ]}
      />
      <Segmented
        label="Block length (days)"
        value={block}
        onChange={setBlock}
        options={[
          { value: "1", label: "1" },
          { value: "5", label: "5" },
          { value: "21", label: "21" },
          { value: "63", label: "63" },
        ]}
      />
    </div>
  );

  return (
    <Loaded state={state} title="Simulation">
      {(d, stale) => {
        const f = d.fan;
        const pr = d.probabilities;
        const se = (p: { std_error: number }) => `±${pct(p.std_error * 1.96, 1)}`;
        return (
          <SectionFrame
            title="Simulation"
            stale={stale}
            method="monte-carlo"
            methodLabel="block-bootstrap Monte Carlo"
            quality={d.data_quality}
            asOf={d.as_of}
            answer={
              <>
                Starting from $10,000, nine in ten of {d.paths.toLocaleString()} simulated{" "}
                {yearsN === 1 ? "years" : `${yearsN}-year periods`} end between {usd(d.final.p5)} and{" "}
                {usd(d.final.p95)}. About {pct(pr.loss.p, 0)} end below where they started.
              </>
            }
          >
            {controls}
            <Block
              title={`Simulated value of $10,000 over ${yearsN === 1 ? "one year" : `${yearsN} years`}`}
              caption={
                <>
                  Assumptions: {d.assumptions.method}, {d.assumptions.block_days}-day blocks, drawn from{" "}
                  {plural(Math.round(d.assumptions.sample_years * 10) / 10, "year")} of history ({d.assumptions.sample_start.slice(0, 4)} to{" "}
                  {d.assumptions.sample_end.slice(0, 4)}), {d.assumptions.mean_mode === "zero" ? "average daily return set to zero" : "historical average return"}, rebalanced {d.assumptions.rebalancing}.{" "}
                  {d.assumptions.notes.join(" ")}
                </>
              }
            >
              <Legend
                items={[
                  { label: "Middle 50% of paths", color: "var(--band-inner)", kind: "swatch" },
                  { label: "Middle 90% of paths", color: "var(--band-outer)", kind: "swatch" },
                  { label: "Median path", color: "var(--series-1)" },
                ]}
              />
              <LineChart
                x={f.days}
                xType="linear"
                xFormat={horizonLabel}
                xTickValues={horizonTicks(f.days[f.days.length - 1])}
                series={[
                  { id: "p95", label: "95th pct", values: f.p95, color: "transparent", width: 0, endLabel: true },
                  { id: "p50", label: "Median", values: f.p50, color: "var(--series-1)", endLabel: true },
                  { id: "p5", label: "5th pct", values: f.p5, color: "transparent", width: 0, endLabel: true },
                ]}
                bands={[
                  { id: "o", lower: f.p5, upper: f.p95, fill: "var(--band-outer)" },
                  { id: "i", lower: f.p25, upper: f.p75, fill: "var(--band-inner)" },
                ]}
                refLines={[{ value: d.start_value, label: "Starting value" }]}
                yFormat={(v) => usd(v)}
                height={320}
                ariaLabel={`Fan chart of simulated values; median ends at ${usd(d.final.p50)}.`}
                readout={(i) => (
                  <>
                    <span>Day {f.days[i]}</span>
                    <span>
                      5th <b>{usd(f.p5[i])}</b>
                    </span>
                    <span>
                      25th <b>{usd(f.p25[i])}</b>
                    </span>
                    <span>
                      Median <b>{usd(f.p50[i])}</b>
                    </span>
                    <span>
                      75th <b>{usd(f.p75[i])}</b>
                    </span>
                    <span>
                      95th <b>{usd(f.p95[i])}</b>
                    </span>
                  </>
                )}
              />
            </Block>

            <Block
              title="Key numbers"
              caption={`Probabilities are shares of simulated paths; the ± figure is Monte Carlo error from using ${d.paths.toLocaleString()} paths, not uncertainty about markets.`}
            >
              <StatGrid>
                <Stat label="Median ending value" value={usd(d.final.p50)} range={`middle half ${usd(d.final.p25)} to ${usd(d.final.p75)}`} />
                <Stat label="Ending below $10,000" value={pct(pr.loss.p)} range={se(pr.loss)} />
                <Stat label="Losing more than 20%" value={pct(pr.loss_20pct.p)} range={se(pr.loss_20pct)} />
                <Stat label="Gaining more than 25%" value={pct(pr.gain_25pct.p)} range={se(pr.gain_25pct)} />
                <Stat
                  label="Deepest fall along the way"
                  value={pct(d.path_max_drawdown.p50)}
                  range={`typical path; 1 in 20 paths fall ${pct(d.path_max_drawdown.p95_worst)} or more`}
                />
              </StatGrid>
            </Block>

            <Block title="Where the simulated paths end">
              <Histogram
                edges={d.histogram.edges}
                counts={d.histogram.counts}
                format={(v) => usd(v)}
                markers={[{ value: d.start_value, label: "Start" }]}
                colorFor={(lo) => (lo < d.start_value ? "var(--reference)" : "var(--series-1)")}
                ariaLabel="Histogram of simulated ending values."
              />
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
