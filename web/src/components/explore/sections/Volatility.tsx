"use client";

import { LineChart } from "@/components/charts/LineChart";
import { isoToTime } from "@/components/charts/axes";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { Notice } from "@/components/ui/States";
import { apiUrl } from "@/lib/api";
import { num, pct } from "@/lib/format";
import type { Volatility } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, Tag, useApi } from "./shared";

function describe(current: number, sample: number): string {
  const r = current / sample;
  if (r < 0.8) return "calmer than its long-run average";
  if (r < 1.3) return "close to its long-run average";
  if (r < 1.8) return "above its long-run average";
  return "far above its long-run average";
}

export function VolatilitySection({ spec }: SectionProps) {
  const state = useApi<Volatility>(apiUrl("volatility", { p: spec }));
  return (
    <Loaded state={state} title="Volatility">
      {(d, stale) => {
        const f = d.forecasts;
        const lb = d.diagnostics.squared_residuals;
        const holdings = Object.entries(d.holding_volatility);
        return (
          <SectionFrame
            title="Volatility"
            stale={stale}
            method="garch"
            methodLabel="GARCH(1,1) volatility forecasting"
            quality={d.data_quality}
            asOf={d.as_of}
            answer={
              <>
                Volatility is running at about {pct(d.current)} a year, {describe(d.current, d.sample_vol)} of{" "}
                {pct(d.sample_vol)}. The model expects it to average {pct(f.average_21d)} over the next month.
              </>
            }
          >
            {d.method === "ewma" && (
              <Notice>
                The GARCH fit was not usable ({d.fallback_reason}), so these figures use an exponentially weighted
                average (RiskMetrics, λ = 0.94). Its forecast is flat: it has no view on where volatility is heading.
              </Notice>
            )}
            <Block
              title="Volatility over the last three years"
              caption="Realized volatility is measured from the past 21 trading days, so it lags. The model's estimate updates every day from the latest return. Both are annualized."
            >
              <Legend
                items={[
                  { label: "Model estimate (conditional volatility)", color: "var(--series-1)" },
                  { label: "Realized, trailing 21 days", color: "var(--reference)" },
                ]}
              />
              <LineChart
                x={d.history.dates.map(isoToTime)}
                series={[
                  { id: "r", label: "Realized", values: d.history.realized_21d, color: "var(--reference)", width: 1.5 },
                  { id: "m", label: "Model", values: d.history.model, color: "var(--series-1)", width: 1.5 },
                ]}
                yFormat={(v) => pct(v, 0)}
                includeZero
                ariaLabel="Model and realized volatility over the last three years."
              />
            </Block>

            <Block
              title="Forecast"
              caption="A day's forecast (point) versus the average over all days up to that horizon. Option pricing and risk budgets over a period need the average; the point value overstates or understates it."
            >
              <StatGrid>
                <Stat label="Next day" value={pct(f.average_1d)} />
                <Stat label="Average, next 5 days" value={pct(f.average_5d)} />
                <Stat label="Average, next 21 days" value={pct(f.average_21d)} />
                <Stat label="Average, next 63 days" value={pct(f.average_63d)} />
              </StatGrid>
              <Legend
                items={[
                  { label: "Average over the horizon", color: "var(--series-1)" },
                  { label: "Single day at the horizon", color: "var(--reference)", kind: "dashed" },
                ]}
              />
              <LineChart
                x={d.term_structure.map((t) => t.day)}
                xType="linear"
                xFormat={(v) => `${v}d`}
                series={[
                  { id: "pt", label: "Single day", values: d.term_structure.map((t) => t.point), color: "var(--reference)", width: 1.5, dash: "4 3" },
                  { id: "avg", label: "Average", values: d.term_structure.map((t) => t.average), color: "var(--series-1)" },
                ]}
                yFormat={(v) => pct(v, 1)}
                height={200}
                ariaLabel="Forecast volatility by horizon, averaged and single-day."
              />
            </Block>

            <div className="two-col">
              <Block
                title="Model"
                caption="Persistence near 1 means shocks fade slowly; half-life is the number of days for a shock's effect on variance to halve. The model's long-run level can differ from the sample average because it is implied by the fitted parameters, which are sensitive to rare volatile stretches."
              >
                <dl className="facts">
                  <dt>Method</dt>
                  <dd>{d.method === "garch" ? "GARCH(1,1), normal quasi-likelihood" : "EWMA fallback"}</dd>
                  <dt>α (reaction)</dt>
                  <dd>{num(d.parameters.alpha, 3)}</dd>
                  <dt>β (memory)</dt>
                  <dd>{num(d.parameters.beta, 3)}</dd>
                  <dt>Persistence α + β</dt>
                  <dd>{num(d.parameters.persistence, 3)}</dd>
                  <dt>Shock half-life</dt>
                  <dd>{d.parameters.half_life_days != null ? `${num(d.parameters.half_life_days, 0)} trading days` : "n/a"}</dd>
                  <dt>Model long-run level</dt>
                  <dd>
                    {d.long_run_model != null ? pct(d.long_run_model) : "n/a"}
                    <span className="faint"> (sample average {pct(d.sample_vol)})</span>
                  </dd>
                  <dt>Higher than now</dt>
                  <dd>{pct(1 - d.percentile_vs_history, 0)} of past days</dd>
                </dl>
              </Block>
              <Block
                title="Residual check"
                caption="If the model captured volatility clustering, its squared standardized residuals should show no remaining autocorrelation. A Ljung-Box p-value below 0.05 says some clustering is left over."
              >
                {lb ? (
                  <dl className="facts">
                    <dt>Ljung-Box, squared residuals ({d.diagnostics.lags} lags)</dt>
                    <dd>
                      p = {num(lb.p_value, 3)}{" "}
                      <Tag>{lb.p_value < 0.05 ? "clustering remains" : "no remaining clustering detected"}</Tag>
                    </dd>
                    <dt>Ljung-Box, residuals</dt>
                    <dd>p = {num(d.diagnostics.residuals?.p_value, 3)}</dd>
                  </dl>
                ) : (
                  <p className="muted small">Not enough data for diagnostics.</p>
                )}
              </Block>
            </div>

            <Block title="Holdings" caption="Each holding fitted on its own. Compared with its own full-sample volatility.">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Weight</th>
                      <th>Volatility now</th>
                      <th>Next 21 days (avg)</th>
                      <th>Own long-run</th>
                      <th className="left">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map(([t, h]) => (
                      <tr key={t}>
                        <td>{t}</td>
                        <td>{pct(h.weight)}</td>
                        <td>{pct(h.current)}</td>
                        <td>{pct(h.average_21d)}</td>
                        <td>{pct(h.sample_vol)}</td>
                        <td className="left">
                          {h.level ?? "n/a"}
                          {h.method === "ewma" && <span className="faint xsmall"> (EWMA)</span>}
                        </td>
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
