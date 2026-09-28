"use client";

import { LineChart } from "@/components/charts/LineChart";
import { StackedArea } from "@/components/charts/StackedArea";
import { isoToTime } from "@/components/charts/axes";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { date, int, num, pct } from "@/lib/format";
import { REGIMES, type Regime, type Regimes } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, useApi } from "./shared";

const COLOR: Record<Regime, string> = {
  calm: "var(--regime-calm)",
  normal: "var(--regime-normal)",
  volatile: "var(--regime-volatile)",
  crisis: "var(--regime-crisis)",
};
function drawdown(growth: number[]): number[] {
  let peak = -Infinity;
  return growth.map((g) => {
    peak = Math.max(peak, g);
    return g / peak - 1;
  });
}

const NAME: Record<Regime, string> = { calm: "Calm", normal: "Normal", volatile: "Volatile", crisis: "Crisis" };

export function RegimesSection({ spec }: SectionProps) {
  const state = useApi<Regimes>(apiUrl("regimes", { p: spec }));
  return (
    <Loaded state={state} title="Regimes">
      {(d, stale) => {
        const cur = d.current;
        const p = cur.probabilities[cur.regime];
        const perf = d.portfolio_by_regime[cur.regime];
        const st = d.stability;
        return (
          <SectionFrame
            title="Market regimes"
            stale={stale}
            method="regimes"
            methodLabel="hidden Markov model regimes"
            quality={d.data_quality}
            asOf={d.as_of}
            answer={
              <>
                The model reads the market as {NAME[cur.regime].toLowerCase()} right now ({pct(p, 0)} probability
                {p >= 0.95 ? ", the most it will report" : ""}), for the last {int(cur.days_in_regime)} trading days.
                {perf.portfolio_return != null && (
                  <>
                    {" "}
                    In past {NAME[cur.regime].toLowerCase()} periods this portfolio returned {pct(perf.portfolio_return)}{" "}
                    a year, against {pct(perf.spy_return)} for the S&amp;P 500.
                  </>
                )}
              </>
            }
          >
            <Block
              title={`Regime probabilities since ${d.sample.start.slice(0, 4)}`}
              caption="Top: how far the S&P 500 was below its previous high. Bottom: each date uses only S&P 500 data up to that date (a forward filter), so the history shows what the model would have said at the time. Model parameters are estimated once on the full sample. States are named by how volatile they are."
            >
              {d.history.spy_growth && (
                <LineChart
                  x={d.history.dates.map(isoToTime)}
                  series={[{ id: "spy", label: "S&P 500 drawdown", values: drawdown(d.history.spy_growth), color: "var(--reference)", width: 1.5 }]}
                  bands={[{ id: "dd", lower: drawdown(d.history.spy_growth), upper: d.history.spy_growth.map(() => 0), fill: "color-mix(in srgb, var(--reference) 18%, transparent)" }]}
                  yFormat={(v) => pct(v, 0)}
                  includeZero
                  height={130}
                  marginLeft={48}
                  ariaLabel="S&P 500 decline from its previous high, for context."
                />
              )}
              <Legend items={REGIMES.map((r) => ({ label: NAME[r], color: COLOR[r], kind: "swatch" as const }))} />
              <StackedArea
                x={d.history.dates.map(isoToTime)}
                layers={REGIMES.map((r) => ({ id: r, label: NAME[r], values: d.history[r], color: COLOR[r] }))}
                valueFormat={(v) => pct(v, 0)}
                ariaLabel="Stacked probabilities of the four market regimes over time."
                marginLeft={48}
                height={240}
              />
            </Block>

            <Block title="Current reading">
              <StatGrid>
                {REGIMES.map((r) => (
                  <Stat key={r} label={NAME[r]} value={pct(cur.probabilities[r], 0)} range={r === cur.regime ? `current, as of ${date(cur.as_of)}` : undefined} />
                ))}
              </StatGrid>
            </Block>

            <Block
              title="What each regime has looked like"
              caption="S&P 500 figures are averages over all days the model assigned to each regime since 2000. Portfolio figures use this portfolio's own history window. Expected duration comes from the model's transition probabilities."
            >
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Regime</th>
                      <th>Share of days</th>
                      <th>Expected duration</th>
                      <th>S&amp;P 500 return</th>
                      <th>S&amp;P 500 volatility</th>
                      <th>Portfolio return</th>
                      <th>Portfolio volatility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REGIMES.map((r) => {
                      const c = d.characteristics[r];
                      const pr = d.portfolio_by_regime[r];
                      return (
                        <tr key={r}>
                          <td>
                            <span className="legend__swatch" style={{ display: "inline-block", background: COLOR[r], marginRight: 8, verticalAlign: "-1px" }} />
                            {NAME[r]}
                          </td>
                          <td>{pct(c.share_of_days, 0)}</td>
                          <td>{d.expected_duration_days[r] != null ? `${num(d.expected_duration_days[r], 0)} days` : "n/a"}</td>
                          <td>{pct(c.annualized_return)}</td>
                          <td>{pct(c.annualized_vol)}</td>
                          <td>{pr.portfolio_return != null ? pct(pr.portfolio_return) : <span className="faint">too few days</span>}</td>
                          <td>{pr.portfolio_vol != null ? pct(pr.portfolio_vol) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Block>

            <Block
              title="How stable is this?"
              caption={`The model was fitted from ${st.starts.length} random starting points and the most likely fit is used. The next-best fits agree with it on ${pct(st.agreement_next_best, 0)} of days (${pct(st.low_vol_agreement_next_best, 0)} on the coarser calm-or-normal versus volatile-or-crisis split).`}
            >
              <details className="small">
                <summary className="muted" style={{ cursor: "pointer" }}>
                  All {st.starts.length} fits
                </summary>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Seed</th>
                        <th>Log-likelihood</th>
                        <th>Agreement with best</th>
                        <th>Coarse agreement</th>
                        <th className="left">Current regime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.starts.map((s) => (
                        <tr key={s.seed}>
                          <td>{s.seed}</td>
                          <td>{num(s.log_likelihood, 1)}</td>
                          <td>{pct(s.agreement, 0)}</td>
                          <td>{pct(s.low_vol_agreement, 0)}</td>
                          <td className="left">{NAME[s.current]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
