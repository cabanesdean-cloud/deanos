"use client";

import { IntervalPlot, type IntervalRow } from "@/components/charts/IntervalPlot";
import { LineChart } from "@/components/charts/LineChart";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { pct } from "@/lib/format";
import { apiParams, describeOption, money, type MonteCarloResult, type PriceResult, signedMoney, yearsLabel } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { nearestIndex } from "./shared";

export const MC_DEFAULT_PATHS = "20000";

export function PriceSection({ inputs }: OptionSectionProps) {
  const p = apiParams(inputs);
  const state = useApi<PriceResult>(apiUrl("options/price", p));
  const mcState = useApi<MonteCarloResult>(apiUrl("options/montecarlo", { ...p, paths: MC_DEFAULT_PATHS }));
  const mc = mcState.status === "ready" ? mcState.data : null;
  const american = inputs.style === "american";

  return (
    <Loaded state={state} title="Price">
      {(d, stale) => {
        const bs = d.black_scholes;
        const tree = d.binomial;
        const headline = american ? tree.american : bs.price;
        const premium = tree.early_exercise_premium;
        const rows: IntervalRow[] = [
          { id: "bs", label: "Black-Scholes", value: bs.price, note: "Closed-form formula, exact under the model's assumptions" },
          ...(mc
            ? [
                {
                  id: "mc",
                  label: "Monte Carlo",
                  value: mc.estimate.price,
                  low: mc.estimate.ci95[0],
                  high: mc.estimate.ci95[1],
                  note: mc.estimate.paths.toLocaleString() + " simulated paths; the line is the 95% interval",
                },
              ]
            : []),
          { id: "eu", label: "Tree, European", value: tree.european, note: "Binomial tree, " + tree.steps + " steps" },
          {
            id: "am",
            label: american ? "Tree, American" : "Tree, American (comparison)",
            value: tree.american,
            color: "var(--series-2)",
            note: american
              ? "Binomial tree, " + tree.steps + " steps, early exercise allowed"
              : "Shown for comparison only: the same contract if it could be exercised before expiry",
          },
        ];
        const vals = rows.flatMap((r) => [r.value, r.low ?? r.value, r.high ?? r.value]);
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        const pad = Math.max((hi - lo) * 0.15, Math.abs(bs.price) * 0.002, 0.005);
        const c = d.curves;
        const si = nearestIndex(c.spot, inputs.S);
        return (
          <SectionFrame
            title="Price"
            stale={stale}
            method="options-black-scholes"
            methodLabel="Black-Scholes-Merton, with Monte Carlo and binomial checks"
            answer={
              american ? (
                premium >= 0.005 ? (
                  <>
                    This American {inputs.type} is worth about {money(headline)} on a {tree.steps}-step binomial tree,{" "}
                    {money(premium)} more than the European version, because it can be exercised before expiry.
                  </>
                ) : (
                  <>
                    This American {inputs.type} is worth about {money(headline)}, the same as the European version: with
                    these inputs, exercising early never beats waiting.
                  </>
                )
              ) : (
                <>
                  This European {inputs.type} is worth about {money(headline)} under Black-Scholes.{" "}
                  {mc ? (
                    <>
                      Monte Carlo lands between {money(mc.estimate.ci95[0])} and {money(mc.estimate.ci95[1])}, and a{" "}
                      {tree.steps}-step binomial tree gives {money(tree.european)}.
                    </>
                  ) : (
                    <>A {tree.steps}-step binomial tree gives {money(tree.european)}.</>
                  )}{" "}
                  The American value in the chart is a comparison, not this option&apos;s price: a European option can only be
                  exercised at expiry, while an American one can be exercised any day before it.
                </>
              )
            }
          >
            <Block
              title="Four ways to price the same option"
              caption="Black-Scholes is a formula. Monte Carlo simulates the price at expiry and averages the payoffs, so it carries sampling error, shown as its 95% interval. The binomial tree steps through time and can value early exercise, which the formula cannot."
            >
              <IntervalPlot
                rows={rows}
                format={money}
                refValue={bs.price}
                domain={[lo - pad, hi + pad]}
                ariaLabel={"Option price by method: Black-Scholes " + money(bs.price) + ", binomial American " + money(tree.american) + "."}
              />
            </Block>

            <Block
              title={"Value today and payoff at expiry, across spot prices"}
              caption={
                "Other inputs held fixed (" + yearsLabel(inputs.T) + " to expiry, " + inputs.v + "% volatility). The gap between the value today and the payoff is time value: what the chance of a better outcome is worth before expiry."
              }
            >
              <Legend
                items={[
                  { label: "Value today (European)", color: "var(--series-1)" },
                  ...(american ? [{ label: "Value today (American)", color: "var(--series-2)" }] : []),
                  { label: "Payoff at expiry", color: "var(--reference)", kind: "dashed" as const },
                ]}
              />
              <LineChart
                x={c.spot}
                xType="linear"
                xFormat={(v) => money(v).replace(/\.\d+$/, "")}
                series={[
                  { id: "payoff", label: "Payoff", values: c.payoff, color: "var(--reference)", dash: "4 3", width: 1.5 },
                  { id: "eu", label: "European", values: c.european, color: "var(--series-1)" },
                  ...(american ? [{ id: "am", label: "American", values: c.american, color: "var(--series-2)" }] : []),
                ]}
                markers={[
                  { index: si, value: american ? c.american[si] : c.european[si], color: american ? "var(--series-2)" : "var(--series-1)", r: 5, label: "Current spot" },
                ]}
                yFormat={money}
                includeZero
                height={300}
                ariaLabel={"Option value against spot price; at the current spot the value is " + money(headline) + "."}
                readout={(i) => (
                  <>
                    <span>Spot {money(c.spot[i])}</span>
                    <span>
                      European <b>{money(c.european[i])}</b>
                    </span>
                    {american && (
                      <span>
                        American <b>{money(c.american[i])}</b>
                      </span>
                    )}
                    <span>
                      Payoff <b>{money(c.payoff[i])}</b>
                    </span>
                  </>
                )}
              />
            </Block>

            <Block title="Key numbers" caption="The probability is under the risk-neutral pricing measure, which assumes the underlying grows at the risk-free rate. It is a pricing device, not a forecast of what will happen.">
              <StatGrid>
                <Stat label={describeOption(inputs) + " value"} value={money(headline)} range={american ? "binomial tree, " + tree.steps + " steps" : "Black-Scholes-Merton formula"} />
                <Stat label="Intrinsic value" value={money(d.intrinsic)} range="payoff if exercised right now" />
                <Stat label="Time value" value={money(headline - d.intrinsic)} range="value above intrinsic" />
                <Stat label="Chance of finishing in the money" value={pct(bs.prob_itm)} range="risk-neutral, not a forecast" />
                <Stat label="Matching call and put" value={money(bs.call) + " / " + money(bs.put)} range={"put-call parity gap " + signedMoney(Math.abs(bs.parity_gap) < 5e-5 ? 0 : bs.parity_gap)} />
              </StatGrid>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
