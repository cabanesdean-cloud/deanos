"use client";

import { useState } from "react";

import { Dumbbell } from "@/components/charts/Dumbbell";
import { LineChart } from "@/components/charts/LineChart";
import { isoToTime } from "@/components/charts/axes";
import { Slider } from "@/components/ui/Controls";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { date, int, num, pct, signedNum, signedPct } from "@/lib/format";
import type { Sensitivity, Stress } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, Tag, useApi } from "./shared";

/** Same formula as the engine's custom_shock, computed here so sliders respond instantly. */
function shock(sens: Record<string, Sensitivity>, weights: Record<string, number>, market: number, bps: number, duration: number) {
  const ief = (-duration * bps) / 10_000;
  const rows = Object.entries(sens).map(([t, s]) => {
    const move = Math.max(-1, s.beta_market * market + s.beta_treasury * ief);
    return { t, s, move, contribution: (weights[t] ?? 0) * move };
  });
  return { ief, rows, total: rows.reduce((a, r) => a + r.contribution, 0) };
}

const METHOD: Record<string, string> = { replay: "actual returns", beta_scaled: "beta-scaled", market_proxy: "market proxy" };

export function StressSection({ spec }: SectionProps) {
  const state = useApi<Stress>(apiUrl("stress", { p: spec }));
  const [picked, setPicked] = useState<string | null>(null);
  const [market, setMarket] = useState(-0.2);
  const [bps, setBps] = useState(100);

  return (
    <Loaded state={state} title="Stress tests">
      {(d, stale) => {
        const sc = d.scenarios;
        const worst = [...sc].sort((a, b) => a.portfolio.return - b.portfolio.return)[0];
        const sel = sc.find((s) => s.id === (picked ?? worst?.id)) ?? worst;
        const weights = Object.fromEntries(d.holdings.map((h) => [h.ticker, h.weight]));
        const duration = d.custom.assumptions.ief_duration_years;
        const cs = shock(d.sensitivities, weights, market, bps, duration);
        return (
          <SectionFrame
            title="Stress tests"
            stale={stale}
            method="stress-tests"
            methodLabel="historical replay and custom shocks"
            quality={d.data_quality}
            asOf={d.as_of}
            answer={
              worst ? (
                <>
                  Replaying {sc.length} market crises, the hardest hit is the {worst.name.toLowerCase()}: this
                  portfolio would have {worst.portfolio.return < 0 ? "fallen" : "gained"}{" "}
                  {pct(Math.abs(worst.portfolio.return))} from the market&apos;s peak to its trough, while the{" "}
                  {"S&P 500"} fell {pct(Math.abs(worst.spy.return))}.
                  {worst.share_replayed < 0.5 && (
                    <>
                      {" "}
                      Treat that one as a rough estimate: {pct(1 - worst.share_replayed, 0)} of the portfolio was not
                      trading then and is modeled from its beta.
                    </>
                  )}
                </>
              ) : (
                <>No crisis window could be replayed for this portfolio.</>
              )
            }
          >
            <Block
              title="Historical crises, start to trough of the S&P 500"
              caption="Buy and hold from the S&P 500's peak to its trough, starting at today's weights. Select a row for the path and per-holding detail."
            >
              <Dumbbell
                rows={sc.map((s) => ({
                  id: s.id,
                  label: s.name,
                  a: s.portfolio.return,
                  b: s.spy.return,
                  note: s.share_replayed < 0.999 ? <span>{pct(1 - s.share_replayed, 0)} of weight estimated</span> : undefined,
                }))}
                aLabel="This portfolio"
                bLabel="S&P 500 (SPY)"
                format={(v) => pct(v, 0)}
                selected={sel?.id}
                onSelect={setPicked}
                ariaLabel="Portfolio and S&P 500 returns in each historical crisis."
              />
            </Block>

            {sel && (
              <Block
                title={`${sel.name}: ${date(sel.start)} to ${date(sel.end)}`}
                caption={
                  <>
                    {sel.description} {int(sel.trading_days)} trading days.{" "}
                    {sel.share_replayed < 0.999 &&
                      `Holdings that were not trading yet (${pct(1 - sel.share_replayed, 0)} of the weight) are stood in for by the S&P 500 scaled by their beta; their true behavior could have been very different.`}
                  </>
                }
              >
                <StatGrid>
                  <Stat label="Portfolio, peak to trough" value={pct(sel.portfolio.return)} range={`S&P 500 ${pct(sel.spy.return)}`} />
                  <Stat label="Deepest point inside the window" value={pct(sel.portfolio.max_drawdown)} range={`S&P 500 ${pct(sel.spy.max_drawdown)}`} />
                  <Stat label="Worst single day" value={pct(sel.portfolio.worst_day)} />
                  <Stat label="Weight replayed with actual data" value={pct(sel.share_replayed, 0)} />
                </StatGrid>
                <Legend
                  items={[
                    { label: "This portfolio", color: "var(--series-1)" },
                    { label: "S&P 500 (SPY)", color: "var(--reference)" },
                  ]}
                />
                <LineChart
                  x={sel.path.dates.map(isoToTime)}
                  series={[
                    { id: "spy", label: "SPY", values: sel.path.spy, color: "var(--reference)", width: 1.5, endLabel: true },
                    { id: "p", label: "Portfolio", values: sel.path.portfolio, color: "var(--series-1)", endLabel: true },
                  ]}
                  yFormat={(v) => signedPct(v - 1, 0)}
                  refLines={[{ value: 1 }]}
                  height={240}
                  ariaLabel={`Value path during ${sel.name}.`}
                />
                <div className="table-wrap" tabIndex={0}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Holding</th>
                        <th>Return</th>
                        <th>Contribution</th>
                        <th className="left">Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(sel.holdings)
                        .sort((a, b) => a[1].contribution - b[1].contribution)
                        .map(([t, h]) => (
                          <tr key={t}>
                            <td>{t}</td>
                            <td>{pct(h.return)}</td>
                            <td>{signedPct(h.contribution)}</td>
                            <td className="left">
                              <Tag>{METHOD[h.method]}</Tag>
                              {h.method !== "replay" && (
                                <span className="faint xsmall">
                                  {" "}
                                  listed {h.listed?.slice(0, 4) ?? "n/a"}, beta {num(h.beta_used)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Block>
            )}

            <Block
              title="Custom shock"
              caption={
                <>
                  Each holding moves by its estimated sensitivity to the S&amp;P 500 and to 7–10 year Treasuries
                  (IEF), measured over the last {int(d.custom.assumptions.sensitivity_window_days)} trading days. A
                  rate rise of {signedNum(bps, 0)} bp moves IEF by about {signedPct(cs.ief)} (duration{" "}
                  {num(duration, 1)} years). {d.custom.assumptions.notes.join(" ")}
                </>
              }
            >
              <div className="controls">
                <Slider label="Stock market move" value={market} min={-0.5} max={0.2} step={0.01} format={(v) => signedPct(v, 0)} onChange={setMarket} />
                <Slider label="Change in interest rates" value={bps} min={-300} max={300} step={25} format={(v) => `${v > 0 ? "+" : ""}${v} bp`} onChange={setBps} />
              </div>
              <StatGrid>
                <Stat label="Estimated portfolio move" value={signedPct(cs.total)} range="instantaneous, linear" />
              </StatGrid>
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Market beta</th>
                      <th>Treasury beta</th>
                      <th>R²</th>
                      <th>Estimated move</th>
                      <th>Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cs.rows.map((r) => (
                      <tr key={r.t}>
                        <td>{r.t}</td>
                        <td>{signedNum(r.s.beta_market)}</td>
                        <td>{signedNum(r.s.beta_treasury)}</td>
                        <td title="How much of the holding's daily movement the two sensitivities explain">{pct(r.s.r_squared, 0)}</td>
                        <td>{signedPct(r.move)}</td>
                        <td>{signedPct(r.contribution)}</td>
                      </tr>
                    ))}
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
