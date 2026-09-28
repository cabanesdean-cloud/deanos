"use client";

import { LineChart } from "@/components/charts/LineChart";
import { HeatTable } from "@/components/charts/HeatTable";
import { isoToTime } from "@/components/charts/axes";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { apiUrl } from "@/lib/api";
import { date, num, pct, range, signedNum, years } from "@/lib/format";
import type { Overview } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, ShareBar, useApi } from "./shared";

export function OverviewSection({ spec }: SectionProps) {
  const state = useApi<Overview>(apiUrl("overview", { p: spec }));
  return (
    <Loaded state={state} title="Overview">
      {(d, stale) => {
        const m = d.metrics;
        const iv = m.intervals;
        const dd = m.max_drawdown;
        const x = d.growth.dates.map(isoToTime);
        const recovered = dd.recovery
          ? `and took until ${date(dd.recovery)} to recover`
          : "and has not fully recovered";
        const holdings = [...d.holdings].sort((a, b) => b.weight - a.weight);
        return (
          <SectionFrame
            title="Overview"
            stale={stale}
            method="performance"
            methodLabel="performance and risk metrics"
            quality={d.data_quality}
            asOf={d.as_of}
            answer={
              <>
                Over the last {years(d.data_quality.trading_days)}, this portfolio grew about {pct(m.cagr)} a year,
                with typical yearly swings of {pct(m.volatility)}. Its worst fall was {pct(Math.abs(dd.depth))}, from{" "}
                {date(dd.peak)} to {date(dd.trough)}, {recovered}.
              </>
            }
          >
            <Block
              title="Growth of $1"
              caption="Daily values, rebalanced to target weights each day, dividends reinvested. The S&P 500 (SPY) is shown for comparison."
            >
              <Legend
                items={[
                  { label: "This portfolio", color: "var(--series-1)" },
                  { label: "S&P 500 (SPY)", color: "var(--reference)" },
                ]}
              />
              <LineChart
                x={x}
                series={[
                  ...(d.growth.spy
                    ? [{ id: "spy", label: "SPY", values: d.growth.spy, color: "var(--reference)", width: 1.5, endLabel: true }]
                    : []),
                  { id: "p", label: "Portfolio", values: d.growth.portfolio, color: "var(--series-1)", endLabel: true },
                ]}
                yFormat={(v) => `$${num(v, v < 10 ? 2 : 1)}`}
                refLines={[{ value: 1 }]}
                ariaLabel={`Growth of one dollar from ${date(d.data_quality.start)}: the portfolio ends at $${num(d.growth.portfolio.at(-1), 2)}.`}
              />
              <LineChart
                x={x}
                series={[{ id: "dd", label: "Drawdown", values: d.growth.drawdown, color: "var(--series-1)", width: 1.5 }]}
                bands={[{ id: "dd", lower: d.growth.drawdown, upper: d.growth.drawdown.map(() => 0), fill: "var(--band-outer)" }]}
                yFormat={(v) => pct(v, 0)}
                includeZero
                height={140}
                ariaLabel={`Drawdown from previous peak; deepest ${pct(dd.depth)}.`}
              />
            </Block>

            <Block
              title="Key numbers"
              caption={`Ranges are ${pct(iv.level.high - iv.level.low, 0)} block-bootstrap intervals: they show how much each figure depends on which days happened to be in the sample, not how the future will turn out.`}
            >
              <StatGrid>
                <Stat label="Annual return (CAGR)" value={pct(m.cagr)} range={range(iv.cagr.low, iv.cagr.high)} />
                <Stat label="Volatility, annualized" value={pct(m.volatility)} range={range(iv.volatility.low, iv.volatility.high)} />
                <Stat label="Sharpe ratio" value={num(m.sharpe)} range={range(iv.sharpe.low, iv.sharpe.high, (v) => num(v))} />
                <Stat label="Maximum drawdown" value={pct(dd.depth)} range={range(iv.max_drawdown.low, iv.max_drawdown.high)} />
                <Stat
                  label="Beta to the S&P 500"
                  value={num(m.beta)}
                  range={m.beta_up != null && m.beta_down != null ? `${num(m.beta_up)} on up days, ${num(m.beta_down)} on down days` : undefined}
                />
                <Stat label="Sortino ratio" value={num(m.sortino)} range={`Calmar ${num(m.calmar)}`} />
                <Stat label="Recent volatility" value={pct(m.volatility_30d)} range={`last 30 days; ${pct(m.volatility_90d)} over 90`} />
                <Stat
                  label="Effective number of holdings"
                  value={num(m.concentration.effective_holdings, 1)}
                  range={`top 3 are ${pct(m.concentration.top3_weight, 0)} of the portfolio`}
                />
              </StatGrid>
            </Block>

            <div className="two-col">
              <Block
                title="Where the risk comes from"
                caption="Share of the portfolio's variance from each holding. A holding can carry more risk than its weight when it is volatile or moves with everything else."
              >
                <div className="table-wrap" tabIndex={0}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Holding</th>
                        <th>Weight</th>
                        <th>Risk share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h) => {
                        const rc = m.risk_contributions[h.ticker] ?? 0;
                        return (
                          <tr key={h.ticker}>
                            <td>
                              <b style={{ fontWeight: 500 }}>{h.ticker}</b>
                            </td>
                            <td>{pct(h.weight)}</td>
                            <td>
                              {pct(rc)}
                              <ShareBar value={rc} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Block>
              <Block
                title="Correlation to benchmarks"
                caption="Correlation of daily returns: 1 moves in lockstep, 0 unrelated, below 0 tends to move the other way."
              >
                <div className="table-wrap" tabIndex={0}>
                  <table className="table">
                    <tbody>
                      {Object.entries(m.correlations).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k === "SPY" ? "S&P 500 (SPY)" : k === "QQQ" ? "Nasdaq-100 (QQQ)" : k === "AGG" ? "US bonds (AGG)" : k}</td>
                          <td>{signedNum(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Block>
            </div>

            {d.correlation_matrix.tickers.length > 1 && (
              <Block title="How the holdings move together" caption="Pairwise correlation of daily returns over the same window. Darker cells are stronger relationships in either direction.">
                <HeatTable labels={d.correlation_matrix.tickers} values={d.correlation_matrix.values} caption="Correlation matrix of holdings" />
              </Block>
            )}
          </SectionFrame>
        );
      }}
    </Loaded>
  );
}
