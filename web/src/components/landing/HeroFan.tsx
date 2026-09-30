"use client";

import Link from "next/link";

import { horizonLabel, horizonTicks } from "@/components/charts/axes";
import { LineChart } from "@/components/charts/LineChart";
import { Legend } from "@/components/ui/Legend";
import { Notice } from "@/components/ui/States";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { apiUrl, useApi } from "@/lib/api";
import { pct, usd } from "@/lib/format";
import { DEFAULT_SPEC } from "@/lib/portfolio";
import type { Simulation } from "@/lib/types";

/** The landing page's live example: one year of simulated outcomes for the Balanced demo. */
export function HeroFan() {
  const res = useApi<Simulation>(apiUrl("simulation", { p: DEFAULT_SPEC }));
  // Shorter on phones so the chart sits on the first screen with the entry points.
  const phone = useMediaQuery("(max-width: 767px)");
  const height = phone ? 232 : 340;

  if (res.status === "error")
    return (
      <Notice>
        The live example could not load ({res.error.message}). You can still{" "}
        <Link href="/deanos/methodology">read how the models work</Link>.
      </Notice>
    );
  // Sized in CSS (.hero-skeleton) so the server-rendered placeholder is right on phones too.
  if (res.status === "loading") return <div className="skeleton hero-skeleton" aria-hidden />;

  const s = res.data;
  const f = s.fan;
  const loss = s.probabilities.loss.p;
  return (
    <figure className="figure">
      <div className="figure__title">
        $10,000 in the Balanced example portfolio, one year out: {s.paths.toLocaleString()} simulated paths
      </div>
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
          { id: "outer", lower: f.p5, upper: f.p95, fill: "var(--band-outer)" },
          { id: "inner", lower: f.p25, upper: f.p75, fill: "var(--band-inner)" },
        ]}
        refLines={[{ value: s.start_value, label: "Starting value" }]}
        yFormat={(v) => usd(v)}
        height={height}
        ariaLabel={`Fan chart of simulated portfolio value over one year. Median ends at ${usd(s.final.p50)}; 90% of paths end between ${usd(s.final.p5)} and ${usd(s.final.p95)}.`}
        readout={(i) => (
          <>
            <span>Day {f.days[i]}</span>
            <span>
              5th <b>{usd(f.p5[i])}</b>
            </span>
            <span>
              Median <b>{usd(f.p50[i])}</b>
            </span>
            <span>
              95th <b>{usd(f.p95[i])}</b>
            </span>
          </>
        )}
      />
      <figcaption className="figure__caption">
        Nine in ten simulated paths end between {usd(s.final.p5)} and {usd(s.final.p95)}; about {pct(loss, 0)} end
        below where they started. Each path strings together real stretches of market history from{" "}
        {s.assumptions.sample_start.slice(0, 4)} to {s.assumptions.sample_end.slice(0, 4)}. The spread is the
        point: it shows how wide a range of outcomes the same portfolio has produced, not where it is going.
      </figcaption>
    </figure>
  );
}
