"use client";

import { useState } from "react";

import { LineChart } from "@/components/charts/LineChart";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Segmented } from "@/components/ui/Controls";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { apiParams, money, moneyDiff, type PriceResult, signedMoney } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { logLabel, logTicks } from "./shared";

type Steps = "100" | "500" | "2000";

/** Spot beyond which the American option is worth exactly its intrinsic value (exercise now). */
function exerciseBoundary(d: PriceResult, kind: "call" | "put", strike: number): number | null {
  const c = d.curves;
  const tol = 1e-6 * Math.max(1, strike);
  const idx = c.spot
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => c.payoff[i] > 0 && c.american[i] - c.payoff[i] <= tol)
    .map(({ s }) => s);
  if (idx.length === 0) return null;
  return kind === "put" ? Math.max(...idx) : Math.min(...idx);
}

export function AmericanSection({ inputs }: OptionSectionProps) {
  const [steps, setSteps] = useState<Steps>("500");
  const state = useApi<PriceResult>(apiUrl("options/price", { ...apiParams(inputs), steps }));
  const noDividendCall = inputs.type === "call" && inputs.q <= 0 && inputs.r >= 0;

  return (
    <Loaded state={state} title="Early exercise">
      {(d, stale) => {
        const t = d.binomial;
        const premium = t.early_exercise_premium;
        const conv = t.convergence;
        const x = conv.steps.map((n) => Math.log10(n));
        const boundary = exerciseBoundary(d, inputs.type, inputs.K);
        const c = d.curves;
        return (
          <SectionFrame
            title="Early exercise"
            stale={stale}
            method="options-binomial"
            methodLabel="Cox-Ross-Rubinstein binomial tree"
            answer={
              premium >= 0.005 ? (
                <>
                  The right to exercise early is worth {moneyDiff(premium)} here: the American {inputs.type} costs{" "}
                  {money(t.american)} against {money(t.european)} for the European one on the same {t.steps}-step tree.
                </>
              ) : noDividendCall ? (
                <>
                  Early exercise is worth nothing for this call. Without dividends, exercising early gives up time value
                  and interest on the strike, so the American and European prices match ({money(t.american)}).
                </>
              ) : (
                <>
                  Early exercise is worth less than half a cent with these inputs; the American and European prices are
                  both about {money(t.american)}.
                </>
              )
            }
          >
            <div className="controls">
              <Segmented
                label="Tree steps"
                value={steps}
                onChange={setSteps}
                options={[
                  { value: "100", label: "100" },
                  { value: "500", label: "500" },
                  { value: "2000", label: "2,000" },
                ]}
              />
            </div>
            <Block
              title="Tree prices converge as the steps get finer"
              caption="Each step lets the price move up or down by a fixed factor. At every node the American option is worth the larger of holding and exercising. The European tree price zigzags toward the Black-Scholes value as steps are added (log scale); the zigzag comes from where the strike falls between nodes."
            >
              <Legend
                items={[
                  { label: "American (tree)", color: "var(--series-2)" },
                  { label: "European (tree)", color: "var(--series-1)" },
                  { label: "Black-Scholes (European)", color: "var(--reference)", kind: "dashed" },
                ]}
              />
              <LineChart
                x={x}
                xType="linear"
                xFormat={logLabel}
                xTickValues={logTicks(x[0], x[x.length - 1])}
                series={[
                  { id: "am", label: "American", values: conv.american, color: "var(--series-2)", width: 1.75 },
                  { id: "eu", label: "European", values: conv.european, color: "var(--series-1)", width: 1.75 },
                ]}
                refLines={[{ value: conv.black_scholes, label: "Black-Scholes" }]}
                yFormat={money}
                height={280}
                ariaLabel={"Binomial prices against number of steps; American " + money(t.american) + ", European " + money(t.european) + "."}
                readout={(i) => (
                  <>
                    <span>{conv.steps[i].toLocaleString()} steps</span>
                    <span>
                      American <b>{money(conv.american[i])}</b>
                    </span>
                    <span>
                      European <b>{money(conv.european[i])}</b>
                    </span>
                  </>
                )}
              />
            </Block>
            <Block
              title="Where exercising immediately is best"
              caption={
                boundary != null
                  ? "Where the American value meets the payoff line, holding is worth no more than exercising. With these inputs that happens when the spot is " +
                    (inputs.type === "put" ? "at or below" : "at or above") +
                    " about " +
                    money(boundary) +
                    " (on a 150-step tree)."
                  : "The American value stays above the payoff at every spot shown, so it is never optimal to exercise today with these inputs."
              }
            >
              <Legend
                items={[
                  { label: "American value", color: "var(--series-2)" },
                  { label: "European value", color: "var(--series-1)" },
                  { label: "Exercise now (payoff)", color: "var(--reference)", kind: "dashed" },
                ]}
              />
              <LineChart
                x={c.spot}
                xType="linear"
                xFormat={(v) => money(v).replace(/\.\d+$/, "")}
                series={[
                  { id: "payoff", label: "Payoff", values: c.payoff, color: "var(--reference)", dash: "4 3", width: 1.5 },
                  { id: "eu", label: "European", values: c.european, color: "var(--series-1)", width: 1.75 },
                  { id: "am", label: "American", values: c.american, color: "var(--series-2)", width: 1.75 },
                ]}
                yFormat={money}
                includeZero
                height={260}
                ariaLabel="American and European values and the exercise payoff against spot price."
                readout={(i) => (
                  <>
                    <span>Spot {money(c.spot[i])}</span>
                    <span>
                      American <b>{money(c.american[i])}</b>
                    </span>
                    <span>
                      European <b>{money(c.european[i])}</b>
                    </span>
                    <span>
                      Payoff <b>{money(c.payoff[i])}</b>
                    </span>
                  </>
                )}
              />
            </Block>
            <Block title="Key numbers">
              <StatGrid>
                <Stat label="American price" value={money(t.american)} range={t.steps.toLocaleString() + "-step tree"} />
                <Stat label="European price" value={money(t.european)} range="same tree" />
                <Stat label="Early-exercise premium" value={money(premium)} range="American minus European" />
                <Stat label="Black-Scholes (European)" value={money(d.black_scholes.price)} range={"tree error " + signedMoney(t.european - d.black_scholes.price)} />
              </StatGrid>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
