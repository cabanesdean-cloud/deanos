"use client";

import { IntervalPlot } from "@/components/charts/IntervalPlot";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Segmented } from "@/components/ui/Controls";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { apiParams, type AsianResult, money } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { ConvergenceChart } from "./shared";

type Averaging = "weekly" | "monthly" | "daily";
const PER_YEAR: Record<Averaging, number> = { daily: 252, weekly: 52, monthly: 12 };
const MAX_CELLS = 2_000_000; // matches the engine's MAX_OPTION_CELLS

export function AsianSection({ inputs, get, set }: OptionSectionProps) {
  const raw = get("avg");
  const avg: Averaging = raw === "monthly" || raw === "daily" ? raw : "weekly";
  const obs = Math.min(1260, Math.max(1, Math.round(PER_YEAR[avg] * inputs.T)));
  const paths = Math.max(1000, Math.min(20_000, Math.floor(MAX_CELLS / obs / 2) * 2));
  const state = useApi<AsianResult>(apiUrl("options/asian", { ...apiParams(inputs), obs, paths }));

  return (
    <Loaded state={state} title="Asian option">
      {(d, stale) => {
        const e = d.estimate;
        const eu = d.european_black_scholes;
        const cheaper = eu > 0 ? 1 - e.price / eu : 0;
        const vr = d.variance_reduction;
        const c = d.convergence;
        return (
          <SectionFrame
            title="Asian option"
            stale={stale}
            method="options-monte-carlo"
            methodLabel="Monte Carlo for path-dependent options"
            answer={
              <>
                If the payoff uses the average price over {obs} {avg === "daily" ? "daily" : avg === "weekly" ? "weekly" : "monthly"}{" "}
                {obs === 1 ? "date" : "dates"} instead of the final price, this {inputs.type} is worth about {money(e.price)}{" "}
                (± {money(1.96 * e.std_error)}), {cheaper > 0.001 ? pct(cheaper, 0) + " less than" : "about the same as"} the
                European version at {money(eu)}. An average moves less than a single price, so there is less upside to pay for.
              </>
            }
          >
            <div className="controls">
              <Segmented
                label="Averaging"
                value={avg}
                onChange={(v) => set("avg", v === "weekly" ? null : v)}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "daily", label: "Daily" },
                ]}
              />
            </div>
            <Block
              title="Why this needs simulation"
              caption="No formula exists for an option on an arithmetic average, so the price is simulated: whole price paths, not just the final price. A geometric average does have a formula and moves almost in lockstep with the arithmetic one, so it is used as a control variate. Settled at expiry (European-style) regardless of the exercise setting above."
            >
              <IntervalPlot
                rows={[
                  { id: "eu", label: "European", value: eu, color: "var(--reference)", note: "Black-Scholes, final price only" },
                  { id: "geo", label: "Geometric avg", value: d.geometric_closed_form, color: "var(--reference)", note: "Geometric-average Asian, closed-form formula" },
                  {
                    id: "arith",
                    label: "Arithmetic avg",
                    value: e.price,
                    low: e.ci95[0],
                    high: e.ci95[1],
                    note: "Arithmetic-average Asian, Monte Carlo: " + e.paths.toLocaleString() + " paths × " + obs + " dates",
                  },
                ]}
                format={money}
                ariaLabel={"Asian option " + money(e.price) + " against European " + money(eu) + "."}
              />
            </Block>
            <Block title="Convergence of the Asian price" caption="Running estimate with its 95% interval as paths are added (log scale).">
              <ConvergenceChart
                paths={c.paths}
                estimators={[{ id: "a", label: "Arithmetic Asian", mean: c.controlled, se: c.controlled_se, color: "var(--series-1)", band: "var(--band-inner)" }]}
                ariaLabel={"Asian option estimate against number of paths, settling at " + money(e.price) + "."}
              />
            </Block>
            <Block title="Key numbers">
              <StatGrid>
                <Stat label="Asian option price" value={money(e.price)} range={"95% interval " + money(e.ci95[0]) + " to " + money(e.ci95[1])} />
                <Stat label="European price" value={money(eu)} range="same inputs, final price only" />
                <Stat label="Standard error" value={money(e.std_error)} range={"plain Monte Carlo: " + money(d.plain_std_error)} />
                <Stat label="Variance reduction" value={vr != null ? "×" + num(vr, 0) : "n/a"} range="antithetic draws + geometric control" />
              </StatGrid>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
