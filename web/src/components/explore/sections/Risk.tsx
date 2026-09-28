"use client";

import { LineChart } from "@/components/charts/LineChart";
import { isoToTime } from "@/components/charts/axes";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { date, int, lossPct, num, pct, usd } from "@/lib/format";
import type { BacktestResult, Risk, VarMethod } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, ShareBar, useApi } from "./shared";

const METHODS: { id: VarMethod; label: string; short: string }[] = [
  { id: "filtered_historical", label: "Filtered historical (GARCH)", short: "Filtered historical" },
  { id: "historical", label: "Historical simulation", short: "Historical" },
  { id: "parametric", label: "Parametric (normal)", short: "Parametric" },
];

function verdict(r: BacktestResult): string {
  if (r.kupiec.p_value < 0.05) return r.breach_rate > r.expected / r.days ? "Too many breaches" : "Too few breaches";
  if (r.christoffersen.p_value < 0.05) return "Breaches cluster";
  return "Consistent";
}

export function RiskSection({ spec }: SectionProps) {
  const state = useApi<Risk>(apiUrl("risk", { p: spec }));
  return (
    <Loaded state={state} title="Risk">
      {(d, stale) => {
        const e95 = d.estimates["95"];
        const e99 = d.estimates["99"];
        const vars95 = METHODS.map((m) => e95[m.id].var);
        const lo = Math.min(...vars95);
        const hi = Math.max(...vars95);
        const bt = d.backtest;
        const holdings = [...d.holdings].sort((a, b) => b.weight - a.weight);
        return (
          <SectionFrame
            title="Risk"
            stale={stale}
            method="value-at-risk"
            methodLabel="Value at Risk and backtesting"
            quality={d.data_quality}
            asOf={d.as_of}
            answer={
              <>
                On a bad day, the kind that comes about once a month, this portfolio could lose around{" "}
                {lossPct(e95.filtered_historical.var)} or more: {usd(e95.filtered_historical.var * 10_000)} on $10,000.
                The three methods put that figure between {lossPct(lo)} and {lossPct(hi)}.
              </>
            }
          >
            <Block
              title="One-day loss estimates"
              caption="Value at Risk (VaR) is the loss exceeded on only 5% (or 1%) of days. Expected shortfall (ES) is the average loss on those days, so it describes how bad the bad days get."
            >
              <StatGrid>
                <Stat label="VaR 95%, filtered historical" value={lossPct(e95.filtered_historical.var)} range={`methods range ${lossPct(lo)} to ${lossPct(hi)}`} />
                <Stat label="Expected shortfall 95%" value={lossPct(e95.filtered_historical.es)} range="average loss beyond VaR" />
                <Stat label="VaR 99%, filtered historical" value={lossPct(e99.filtered_historical.var)} range={`about 2 or 3 days a year`} />
                <Stat label="Expected shortfall 99%" value={lossPct(e99.filtered_historical.es)} />
              </StatGrid>
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>VaR 95%</th>
                      <th>ES 95%</th>
                      <th>VaR 99%</th>
                      <th>ES 99%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHODS.map((m) => (
                      <tr key={m.id}>
                        <td>{m.label}</td>
                        <td>{lossPct(e95[m.id].var)}</td>
                        <td>{lossPct(e95[m.id].es)}</td>
                        <td>{lossPct(e99[m.id].var)}</td>
                        <td>{lossPct(e99[m.id].es)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>

            {bt && (
              <Block
                title="Did the estimates hold up?"
                caption={`Each day from ${date(bt.start)} to ${date(bt.end)}, VaR was estimated using only earlier data, then compared with what happened. A 95% VaR should be breached on about 5% of days, and breaches should not bunch together. The Kupiec test checks the rate; the Christoffersen test checks the bunching (p-values below 0.05 flag a problem).`}
              >
                <Legend
                  items={[
                    { label: "Daily return", color: "var(--reference)" },
                    { label: "95% VaR, filtered historical (as a loss)", color: "var(--series-1)" },
                    { label: "Breach", color: "var(--neg)", kind: "swatch" },
                  ]}
                />
                <LineChart
                  x={bt.series_95.dates.map(isoToTime)}
                  series={[
                    { id: "r", label: "Return", values: bt.series_95.returns, color: "var(--reference)", width: 1 },
                    { id: "v", label: "VaR", values: bt.series_95.filtered_historical.map((v) => -v), color: "var(--series-1)", width: 1.5 },
                  ]}
                  markers={bt.series_95.returns
                    .map((r, i) => ({ r, i }))
                    .filter(({ r, i }) => r < -bt.series_95.filtered_historical[i])
                    .map(({ r, i }) => ({ index: i, value: r, color: "var(--neg)", r: 2.5 }))}
                  yFormat={(v) => pct(v, 0)}
                  includeZero
                  height={240}
                  ariaLabel="Daily portfolio returns against the one-day 95% VaR forecast, with breaches marked."
                />
                <div className="table-wrap" tabIndex={0}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Breaches (expected)</th>
                        <th>Breach rate</th>
                        <th>Kupiec p</th>
                        <th>Christoffersen p</th>
                        <th className="left">Result at 95%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METHODS.map((m) => {
                        const r = bt.results[m.id]["95"];
                        return (
                          <tr key={m.id}>
                            <td>{m.short}</td>
                            <td>
                              {int(r.breaches)} ({num(r.expected, 1)})
                            </td>
                            <td>{pct(r.breach_rate)}</td>
                            <td>{num(r.kupiec.p_value)}</td>
                            <td>{num(r.christoffersen.p_value)}</td>
                            <td className="left">{verdict(r)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <details className="small">
                  <summary className="muted" style={{ cursor: "pointer" }}>
                    Results at 99%
                  </summary>
                  <div className="table-wrap" tabIndex={0}>
                    <table className="table">
                      <tbody>
                        {METHODS.map((m) => {
                          const r = bt.results[m.id]["99"];
                          return (
                            <tr key={m.id}>
                              <td>{m.short}</td>
                              <td>
                                {int(r.breaches)} breaches ({num(r.expected, 1)} expected)
                              </td>
                              <td>Kupiec p {num(r.kupiec.p_value)}</td>
                              <td>Christoffersen p {num(r.christoffersen.p_value)}</td>
                              <td className="left">{verdict(r)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Block>
            )}

            <Block
              title="Which holdings drive the loss estimate"
              caption="Each holding's share of 95% parametric VaR (Euler allocation). The shares add up to the total; a negative share means the holding tends to offset losses elsewhere."
            >
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Weight</th>
                      <th>VaR share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => {
                      const c = d.contributions_95[h.ticker];
                      return (
                        <tr key={h.ticker}>
                          <td>{h.ticker}</td>
                          <td>{pct(h.weight)}</td>
                          <td>
                            {pct(c?.share)}
                            <ShareBar value={c?.share ?? 0} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Block>
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
