"use client";

import { useState } from "react";

import { LineChart } from "@/components/charts/LineChart";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Segmented } from "@/components/ui/Controls";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { num } from "@/lib/format";
import { apiParams, money, type PriceResult } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { nearestIndex } from "./shared";

type GreekKey = "delta" | "gamma" | "vega" | "theta";

/** Display scaling: vega per volatility point, theta per calendar day. */
const GREEKS: Record<GreekKey, { label: string; scale: number; format: (v: number) => string; unit: string }> = {
  delta: { label: "Delta", scale: 1, format: (v) => num(v, 2), unit: "change in option value per $1 move in the underlying" },
  gamma: { label: "Gamma", scale: 1, format: (v) => num(v, 4), unit: "change in delta per $1 move" },
  vega: { label: "Vega", scale: 0.01, format: money, unit: "value change per 1 point of volatility" },
  theta: { label: "Theta", scale: 1 / 365, format: money, unit: "value change per calendar day" },
};

export function GreeksSection({ inputs }: OptionSectionProps) {
  const [greek, setGreek] = useState<GreekKey>("delta");
  const state = useApi<PriceResult>(apiUrl("options/price", apiParams(inputs)));

  return (
    <Loaded state={state} title="Greeks">
      {(d, stale) => {
        const g = d.black_scholes.greeks;
        const perDay = g.theta / 365;
        const c = d.curves;
        const spec = GREEKS[greek];
        const values = c[greek].map((v) => v * spec.scale);
        const si = nearestIndex(c.spot, inputs.S);
        return (
          <SectionFrame
            title="Greeks"
            stale={stale}
            method="options-black-scholes"
            methodLabel="Black-Scholes-Merton Greeks"
            answer={
              <>
                If the underlying rises $1, this {inputs.type} {g.delta >= 0 ? "gains" : "loses"} about{" "}
                {money(Math.abs(g.delta))}. Each day that passes {perDay <= 0 ? "costs" : "adds"} about{" "}
                {money(Math.abs(perDay))}, and one more point of volatility adds {money(g.vega / 100)}, other things equal.
              </>
            }
          >
            <Block
              title="Sensitivities at the current inputs"
              caption={
                "Analytic Black-Scholes-Merton Greeks for the European option, checked against finite differences in the test suite." +
                (inputs.style === "american" ? " The American option's sensitivities are close when the early-exercise premium is small." : "") +
                " Each one holds every other input fixed, so they describe small moves only."
              }
            >
              <StatGrid>
                <Stat label="Delta" value={num(g.delta, 3)} range="value change per $1 in the underlying" />
                <Stat label="Gamma" value={num(g.gamma, 4)} range="change in delta per $1" />
                <Stat label="Vega" value={money(g.vega / 100)} range="per 1 point of volatility" />
                <Stat label="Theta" value={money(perDay)} range={"per day (" + money(g.theta) + " a year)"} />
                <Stat label="Rho" value={money(g.rho / 100)} range="per 1 point of interest rates" />
              </StatGrid>
            </Block>
            <Block title={spec.label + " across spot prices"} caption={spec.label + ": " + spec.unit + ". The dot marks the current spot price."}>
              <div className="controls">
                <Segmented
                  label="Show"
                  value={greek}
                  onChange={setGreek}
                  options={(Object.keys(GREEKS) as GreekKey[]).map((k) => ({ value: k, label: GREEKS[k].label }))}
                />
              </div>
              <LineChart
                x={c.spot}
                xType="linear"
                xFormat={(v) => money(v).replace(/\.\d+$/, "")}
                series={[{ id: greek, label: spec.label, values, color: "var(--series-1)" }]}
                markers={[{ index: si, value: values[si], color: "var(--series-1)", r: 5, label: "Current spot" }]}
                yFormat={spec.format}
                includeZero
                height={280}
                ariaLabel={spec.label + " against spot price; at the current spot it is " + spec.format(values[si]) + "."}
                readout={(i) => (
                  <>
                    <span>Spot {money(c.spot[i])}</span>
                    <span>
                      {spec.label} <b>{spec.format(values[i])}</b>
                    </span>
                  </>
                )}
              />
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
