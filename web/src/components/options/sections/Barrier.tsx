"use client";

import { IntervalPlot } from "@/components/charts/IntervalPlot";
import { Block, SectionFrame } from "@/components/explore/SectionFrame";
import { Loaded, useApi } from "@/components/explore/sections/shared";
import { Segmented } from "@/components/ui/Controls";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { apiParams, type BarrierResult, type BarrierType, money } from "@/lib/options";

import type { OptionSectionProps } from "../OptionsExplorer";
import { ConvergenceChart } from "./shared";

type Monitoring = "daily" | "weekly" | "monthly";
const PER_YEAR: Record<Monitoring, number> = { daily: 252, weekly: 52, monthly: 12 };
const MAX_CELLS = 2_000_000; // matches the engine's MAX_OPTION_CELLS
const TYPES: BarrierType[] = ["up-and-out", "down-and-out", "up-and-in", "down-and-in"];
const LEVELS: Record<"up" | "down", string[]> = { up: ["105", "110", "120", "130"], down: ["95", "90", "80", "70"] };

export function BarrierSection({ inputs, get, set }: OptionSectionProps) {
  const rawType = get("bt");
  const btype: BarrierType = TYPES.includes(rawType as BarrierType) ? (rawType as BarrierType) : "up-and-out";
  const dir = btype.startsWith("up") ? "up" : "down";
  const rawLevel = get("bh");
  const level = rawLevel && LEVELS[dir].includes(rawLevel) ? rawLevel : dir === "up" ? "120" : "90";
  const rawMon = get("mon");
  const mon: Monitoring = rawMon === "daily" || rawMon === "monthly" ? rawMon : "weekly";
  const h = Math.round(inputs.S * Number(level)) / 100;
  const obs = Math.min(1260, Math.max(1, Math.round(PER_YEAR[mon] * inputs.T)));
  const paths = Math.max(1000, Math.min(20_000, Math.floor(MAX_CELLS / obs / 2) * 2));
  const state = useApi<BarrierResult>(apiUrl("options/barrier", { ...apiParams(inputs), h, btype, obs, paths }));
  const out = btype.endsWith("out");

  return (
    <Loaded state={state} title="Barrier option">
      {(d, stale) => {
        const e = d.estimate;
        const eu = d.european_black_scholes;
        const vr = d.variance_reduction;
        const c = d.convergence;
        const touch = dir === "up" ? "rises to" : "falls to";
        return (
          <SectionFrame
            title="Barrier option"
            stale={stale}
            method="options-monte-carlo"
            methodLabel="Monte Carlo for path-dependent options"
            answer={
              <>
                {out
                  ? `This ${inputs.type} is cancelled if the price ${touch} ${money(h)} on any of ${obs} ${mon} checks before expiry.`
                  : `This ${inputs.type} only comes alive if the price ${touch} ${money(h)} on one of ${obs} ${mon} checks before expiry.`}{" "}
                Simulated value: {money(e.price)} (± {money(1.96 * e.std_error)}), against {money(eu)} for the ordinary
                European option. The barrier was touched on {pct(d.hit_share, 0)} of simulated paths.
              </>
            }
          >
            <div className="controls">
              <Segmented
                label="Barrier type"
                value={btype}
                // A level from the other direction falls back to that direction's default.
                onChange={(v) => set("bt", v === "up-and-out" ? null : v)}
                options={TYPES.map((t) => ({ value: t, label: t.replace(/-/g, " ") }))}
              />
              <Segmented
                label="Barrier (% of spot)"
                value={level}
                onChange={(v) => set("bh", v === (dir === "up" ? "120" : "90") ? null : v)}
                options={LEVELS[dir].map((l) => ({ value: l, label: l + "%" }))}
              />
              <Segmented
                label="Checked"
                value={mon}
                onChange={(v) => set("mon", v === "weekly" ? null : v)}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "daily", label: "Daily" },
                ]}
              />
            </div>
            {d.breached_at_start && (
              <p className="small muted">
                The spot is already beyond the barrier, so the option is {out ? "knocked out (worth nothing)" : "already knocked in (the European option)"}.
              </p>
            )}
            <Block
              title="Simulation against the formulas"
              caption={`The contract is checked only on ${obs} dates, which is what the simulation prices. The closed-form formula assumes the barrier is watched continuously, so a path can cross between two checks and come back unseen: a discretely checked knock-out is worth more than the formula, a knock-in less. The Broadie-Glasserman-Kou correction shifts the barrier by e^(0.5826·σ·√(T/n)) to approximate the discrete price; it is an approximation, the simulation is the reference.`}
            >
              <IntervalPlot
                rows={[
                  { id: "eu", label: "European", value: eu, color: "var(--reference)", note: "Black-Scholes, no barrier" },
                  { id: "cont", label: "Continuous", value: d.continuous_closed_form, color: "var(--reference)", note: "Closed form, barrier watched continuously" },
                  { id: "bgk", label: "BGK approx.", value: d.discrete_bgk, color: "var(--reference)", note: "Closed form with the discrete-monitoring correction" },
                  {
                    id: "mc",
                    label: "Monte Carlo",
                    value: e.price,
                    low: e.ci95[0],
                    high: e.ci95[1],
                    note: "Discrete barrier, Monte Carlo: " + e.paths.toLocaleString() + " paths × " + obs + " dates",
                  },
                ]}
                format={money}
                ariaLabel={`Barrier option ${money(e.price)}; continuous formula ${money(d.continuous_closed_form)}; European ${money(eu)}.`}
              />
            </Block>
            <Block title="Convergence of the barrier price" caption="Running estimate with its 95% interval as paths are added (log scale).">
              <ConvergenceChart
                paths={c.paths}
                estimators={[{ id: "b", label: "Barrier option", mean: c.controlled, se: c.controlled_se, color: "var(--series-1)", band: "var(--band-inner)" }]}
                ariaLabel={"Barrier option estimate against number of paths, settling at " + money(e.price) + "."}
              />
            </Block>
            <Block title="Key numbers">
              <StatGrid>
                <Stat label="Barrier option price" value={money(e.price)} range={"95% interval " + money(e.ci95[0]) + " to " + money(e.ci95[1])} />
                <Stat label="Barrier level" value={money(h)} range={level + "% of spot, " + btype.replace(/-/g, " ")} />
                <Stat label="Standard error" value={money(e.std_error)} range={"plain Monte Carlo: " + money(d.plain_std_error)} />
                <Stat label="Variance reduction" value={vr != null ? "×" + num(vr, 1) : "n/a"} range="antithetic draws" />
              </StatGrid>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
