"use client";

import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Segmented } from "@/components/ui/Controls";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { num } from "@/lib/format";
import { apiParams, money, type MonteCarloResult, pathsLabel, signedMoney } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { MC_DEFAULT_PATHS } from "./Price";
import { ConvergenceChart } from "./shared";

const PATHS = ["5000", "20000", "100000"] as const;
type Paths = (typeof PATHS)[number];

export function MonteCarloSection({ inputs, get, set }: OptionSectionProps) {
  const raw = get("n");
  const paths: Paths = PATHS.includes(raw as Paths) ? (raw as Paths) : (MC_DEFAULT_PATHS as Paths);
  const state = useApi<MonteCarloResult>(apiUrl("options/montecarlo", { ...apiParams(inputs), paths }));

  const controls = (
    <div className="controls">
      <Segmented
        label="Simulated paths"
        value={paths}
        onChange={(v) => set("n", v === MC_DEFAULT_PATHS ? null : v)}
        options={PATHS.map((p) => ({ value: p, label: pathsLabel(Number(p)) }))}
      />
    </div>
  );

  return (
    <Loaded state={state} title="Monte Carlo">
      {(d, stale) => {
        const e = d.estimate;
        const vr = d.variance_reduction.antithetic_control;
        const zScore = e.std_error > 0 ? d.error_vs_black_scholes / e.std_error : 0;
        const c = d.convergence;
        return (
          <SectionFrame
            title="Monte Carlo"
            stale={stale}
            method="options-monte-carlo"
            methodLabel="Monte Carlo with antithetic variates and a control variate"
            answer={
              <>
                Simulating {e.paths.toLocaleString()} prices at expiry values this European {inputs.type} at {money(e.price)},
                give or take {money(1.96 * e.std_error)}. The Black-Scholes price, {money(d.black_scholes)}, is{" "}
                {d.within_ci ? "inside" : "just outside"} that range.
                {vr != null && vr > 1.5 && (
                  <>
                    {" "}
                    Variance reduction makes it as precise as about {Number((e.paths * vr).toPrecision(2)).toLocaleString()} plain simulations.
                  </>
                )}
              </>
            }
          >
            {controls}
            <Block
              title="The estimate settles as paths are added"
              caption={
                "Each point uses the first n simulated paths (log scale). Plain Monte Carlo averages independent payoffs; the variance-reduced estimate pairs every draw with its mirror image (antithetic variates) and corrects for how far the simulated average price strays from its known expectation (a control variate). Both intervals shrink with the square root of the number of paths. Fixed random seed " +
                d.seed +
                ", so the same inputs always give the same numbers."
              }
            >
              <ConvergenceChart
                paths={c.paths}
                estimators={[
                  { id: "plain", label: "Plain Monte Carlo", mean: c.plain, se: c.plain_se, color: "var(--reference)", band: "var(--band-ref)" },
                  { id: "vr", label: "With variance reduction", mean: c.controlled, se: c.controlled_se, color: "var(--series-1)", band: "var(--band-inner)" },
                ]}
                reference={d.black_scholes}
                referenceLabel="Black-Scholes"
                ariaLabel={"Monte Carlo estimate against number of paths, converging to " + money(e.price) + "."}
              />
            </Block>
            <Block
              title="Key numbers"
              caption="The ± figures are Monte Carlo sampling error: they shrink with more paths. They say nothing about whether the model's assumptions (constant volatility, lognormal prices) fit a real market."
            >
              <StatGrid>
                <Stat label="Monte Carlo price" value={money(e.price)} range={"95% interval " + money(e.ci95[0]) + " to " + money(e.ci95[1])} />
                <Stat label="Standard error" value={money(e.std_error)} range={"plain Monte Carlo: " + money(d.plain.std_error)} />
                <Stat
                  label="Variance reduction"
                  value={vr != null ? "×" + num(vr, 1) : "n/a"}
                  range={
                    d.variance_reduction.antithetic != null
                      ? "antithetic alone ×" + num(d.variance_reduction.antithetic, 1)
                      : "no randomness to reduce"
                  }
                />
                <Stat label="Difference from Black-Scholes" value={signedMoney(d.error_vs_black_scholes)} range={num(zScore, 1) + " standard errors"} />
                <Stat label="Compute time" value={Math.max(1, Math.round(d.compute_seconds * 1000)) + " ms"} range="on the server" />
              </StatGrid>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
