"use client";

import { useId, useState } from "react";

import { LineChart } from "@/components/charts/LineChart";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { useApi } from "@/components/explore/sections/shared";
import { Notice, SectionSkeleton, Skeleton } from "@/components/ui/States";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { pct } from "@/lib/format";
import { apiParams, type ImpliedVolResult, money, type PriceResult } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { nearestIndex } from "./shared";

export function ImpliedVolSection({ inputs, get, set }: OptionSectionProps) {
  const params = apiParams(inputs);
  const noSigma = Object.fromEntries(Object.entries(params).filter(([k]) => k !== "sigma"));
  const model = useApi<PriceResult>(apiUrl("options/price", params));
  const typed = Number(get("mp"));
  const modelPrice = model.status === "ready" ? Math.round(model.data.black_scholes.price * 100) / 100 : null;
  const target = Number.isFinite(typed) && typed > 0 ? typed : modelPrice;
  const state = useApi<ImpliedVolResult>(target != null && target > 0 ? apiUrl("options/implied-vol", { ...noSigma, price: String(target) }) : null);

  if (target == null) {
    if (model.status === "error") return <Notice tone="error">{model.error.message}</Notice>;
    return <SectionSkeleton />;
  }
  const d = state.status === "ready" ? state.data : null;
  const stale = state.stale;

  return (
    <SectionFrame
      title="Implied volatility"
      stale={stale}
      method="options-implied-vol"
      methodLabel="implied volatility solver"
      answer={
        d ? (
          <>
            A price of {money(target)} for this European {inputs.type} implies volatility of {pct(d.sigma, 1)} a year.
            {Math.abs(d.sigma - inputs.v / 100) < 0.005
              ? " That recovers the volatility set above, as it should: the solver inverts the pricing formula."
              : d.sigma > inputs.v / 100
                ? " The market would be pricing in more movement than the " + inputs.v + "% set above."
                : " The market would be pricing in less movement than the " + inputs.v + "% set above."}
          </>
        ) : state.status === "error" ? (
          <>No volatility produces a price of {money(target)} for this option.</>
        ) : (
          <>Solving for the volatility behind a price of {money(target)}…</>
        )
      }
    >
      <PriceInput key={String(target)} initial={target} modelPrice={modelPrice} onSolve={(v) => set("mp", v == null ? null : String(v))} />
      {state.status === "error" && <Notice tone="error">{state.error.message}</Notice>}
      {state.status === "loading" && <Skeleton height={280} />}
      {d && (
        <>
          <Block
            title="Price rises with volatility; the solver reads it backward"
            caption="Black-Scholes price of this option at each volatility, other inputs fixed. Because the curve always rises, exactly one volatility matches any price between the no-arbitrage bounds. The solver takes Newton steps along the curve's slope (vega) and falls back to bisection whenever a step would leave the range known to contain the answer."
          >
            <PriceVolChart d={d} target={target} />
          </Block>
          <Block title="Key numbers">
            <StatGrid>
              <Stat label="Implied volatility" value={pct(d.sigma, 2)} range="a year" />
              <Stat label="Solver steps" value={String(d.iterations)} range={d.steps.newton + " Newton, " + d.steps.bisection + " bisection"} />
              <Stat label="Price at that volatility" value={money(d.repriced)} range="round-trip check" />
              <Stat label="Possible prices" value={money(d.bounds[0]) + " to " + money(d.bounds[1])} range="no-arbitrage bounds" />
            </StatGrid>
          </Block>
        </>
      )}
    </SectionFrame>
  );
}

function PriceVolChart({ d, target }: { d: ImpliedVolResult; target: number }) {
  const i = nearestIndex(d.curve.sigma, d.sigma);
  return (
    <LineChart
      x={d.curve.sigma}
      xType="linear"
      xFormat={(v) => pct(v, 0)}
      series={[{ id: "p", label: "Price", values: d.curve.price, color: "var(--series-1)" }]}
      markers={[{ index: i, value: d.curve.price[i], color: "var(--series-2)", r: 6, label: "Implied volatility " + pct(d.sigma, 1) }]}
      refLines={[{ value: target, label: "Your price" }]}
      yFormat={money}
      height={280}
      ariaLabel={"Option price against volatility; the price " + money(target) + " corresponds to " + pct(d.sigma, 1) + "."}
      readout={(k) => (
        <>
          <span>Volatility {pct(d.curve.sigma[k], 1)}</span>
          <span>
            Price <b>{money(d.curve.price[k])}</b>
          </span>
        </>
      )}
    />
  );
}

function PriceInput({ initial, modelPrice, onSolve }: { initial: number; modelPrice: number | null; onSolve: (v: number | null) => void }) {
  const id = useId();
  const [text, setText] = useState(String(initial));
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(n) && n > 0 && n <= 1_000_000;
  return (
    <form
      className="controls"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSolve(n);
      }}
    >
      <div className="field">
        <label htmlFor={id} className="small muted">
          Observed option price
        </label>
        <input
          id={id}
          className="input field__input"
          inputMode="decimal"
          value={text}
          aria-invalid={!valid || undefined}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <button type="submit" className="button" disabled={!valid}>
        Find implied volatility
      </button>
      {modelPrice != null && (
        <button type="button" className="button button--ghost" onClick={() => onSolve(null)}>
          Reset to model price ({money(modelPrice)})
        </button>
      )}
    </form>
  );
}
