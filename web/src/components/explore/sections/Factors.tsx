"use client";

import { useState } from "react";

import { IntervalPlot } from "@/components/charts/IntervalPlot";
import { LineChart } from "@/components/charts/LineChart";
import { isoToTime } from "@/components/charts/axes";
import { Segmented } from "@/components/ui/Controls";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { date, num, pct, range, signedNum, signedPct } from "@/lib/format";
import { type Factor, FACTORS, type Factors } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, useApi } from "./shared";

const SHORT: Record<Factor, string> = {
  "Mkt-RF": "Market",
  SMB: "Size (small minus big)",
  HML: "Value (cheap minus expensive)",
  RMW: "Profitability (robust minus weak)",
  CMA: "Investment (conservative minus aggressive)",
  Mom: "Momentum (winners minus losers)",
};
const TILT: Record<Factor, [string, string]> = {
  "Mkt-RF": ["more market exposure", "less market exposure"],
  SMB: ["toward smaller companies", "toward larger companies"],
  HML: ["toward value stocks", "toward growth stocks"],
  RMW: ["toward more profitable companies", "toward less profitable companies"],
  CMA: ["toward conservative investors", "toward fast-growing investors"],
  Mom: ["toward recent winners", "toward recent losers"],
};

export function FactorsSection({ spec }: SectionProps) {
  const [rollF, setRollF] = useState<Factor>("Mkt-RF");
  const state = useApi<Factors>(apiUrl("factors", { p: spec }));
  return (
    <Loaded state={state} title="Factors">
      {(d, stale) => {
        const L = d.loadings;
        const sig = (f: Factor) => L[f].ci95[0] > 0 || L[f].ci95[1] < 0;
        // Mention a tilt only if it is both statistically clear and at least 0.1 in size.
        const others = FACTORS.filter((f) => f !== "Mkt-RF" && sig(f) && Math.abs(L[f].beta) >= 0.1).sort((a, b) => Math.abs(L[b].beta) - Math.abs(L[a].beta));
        const top = others[0];
        const alphaSig = d.alpha.ci95[0] > 0 || d.alpha.ci95[1] < 0;
        return (
          <SectionFrame
            title="Factor exposures"
            stale={stale}
            method="factors"
            methodLabel="Fama-French five-factor plus momentum regression"
            quality={d.data_quality}
            asOf={d.as_of}
            factorsAsOf={d.window.factor_data_end}
            answer={
              <>
                {pct(d.r_squared, 0)} of this portfolio&apos;s daily ups and downs line up with six well-known
                factors. Its market beta is {num(L["Mkt-RF"].beta)}
                {top ? (
                  <>
                    , and its clearest other tilt is {TILT[top][L[top].beta > 0 ? 0 : 1]} ({SHORT[top].split(" (")[0].toLowerCase()} beta{" "}
                    {signedNum(L[top].beta)})
                  </>
                ) : (
                  <>; no other tilt is both clear and larger than 0.1</>
                )}
                .
              </>
            }
          >
            <Block
              title="Loadings with 95% intervals"
              caption="How much the portfolio's excess return moves per unit of each factor. Grey rows have an interval that includes zero, so the data cannot tell that tilt apart from none. Intervals use Newey-West standard errors, which allow for autocorrelation and changing volatility."
            >
              <IntervalPlot
                rows={FACTORS.map((f) => ({
                  id: f,
                  label: SHORT[f].split(" (")[0],
                  value: L[f].beta,
                  low: L[f].ci95[0],
                  high: L[f].ci95[1],
                  muted: !sig(f),
                  note: L[f].description,
                }))}
                format={(v) => signedNum(v)}
                ariaLabel="Factor loadings with 95% confidence intervals."
              />
            </Block>

            <Block title="Fit">
              <StatGrid>
                <Stat label="R², share of variation explained" value={pct(d.r_squared, 0)} range={`adjusted ${pct(d.adj_r_squared, 0)}`} />
                <Stat
                  label="Alpha, annualized"
                  value={signedPct(d.alpha.annualized)}
                  range={`${range(d.alpha.ci95[0], d.alpha.ci95[1], (v) => signedPct(v))}${alphaSig ? "" : ": not distinguishable from zero"}`}
                />
                <Stat label="Unexplained volatility" value={pct(d.residual_vol)} range="annualized residual" />
                <Stat
                  label="Largest VIF"
                  value={num(d.max_vif, 1)}
                  range={d.max_vif < 5 ? "factors separable in this sample" : "factors overlap: read loadings with care"}
                />
              </StatGrid>
            </Block>

            <Block
              title="How exposures have changed"
              caption={`One-year rolling regressions, stepped monthly. Window: ${date(d.window.start)} to ${date(d.window.end)}; French factor data currently ends ${date(d.window.factor_data_end)}.`}
            >
              <Segmented
                label="Factor"
                value={rollF}
                onChange={setRollF}
                options={FACTORS.map((f) => ({ value: f, label: SHORT[f].split(" (")[0] }))}
              />
              <LineChart
                x={d.rolling.dates.map(isoToTime)}
                series={[{ id: rollF, label: SHORT[rollF].split(" (")[0], values: d.rolling[rollF], color: "var(--series-1)", endLabel: true }]}
                refLines={[{ value: L[rollF].beta, label: "Full-window estimate" }]}
                yFormat={(v) => signedNum(v)}
                includeZero
                height={220}
                ariaLabel={`Rolling one-year ${rollF} loading.`}
              />
            </Block>

            <Block title="Detail" caption="Return contribution is the loading times the factor's average return over the window: how much of the portfolio's return each exposure accounts for.">
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Factor</th>
                      <th>Loading</th>
                      <th>95% interval</th>
                      <th>t-stat</th>
                      <th>VIF</th>
                      <th>Return contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FACTORS.map((f) => (
                      <tr key={f}>
                        <td title={L[f].description}>{SHORT[f]}</td>
                        <td>{signedNum(L[f].beta)}</td>
                        <td>{range(L[f].ci95[0], L[f].ci95[1], (v) => signedNum(v))}</td>
                        <td>{num(L[f].t_stat, 1)}</td>
                        <td>{num(L[f].vif, 1)}</td>
                        <td>{signedPct(L[f].annual_return_contribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="xsmall faint">{d.source}. Newey-West lags: {d.newey_west_lags}.</p>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
