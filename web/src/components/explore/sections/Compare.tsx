"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LineChart } from "@/components/charts/LineChart";
import { isoToTime } from "@/components/charts/axes";
import { Legend } from "@/components/ui/Legend";
import { Notice } from "@/components/ui/States";
import { apiUrl } from "@/lib/api";
import { date, num, pct, signedNum, signedPct } from "@/lib/format";
import { type Holding, normalized, parseSpec, toSpec } from "@/lib/portfolio";
import type { Compare } from "@/lib/types";

import type { SectionProps } from "../Explorer";
import { demoFor } from "../PortfolioBar";
import { PortfolioEditor } from "../PortfolioEditor";
import { Block, SectionFrame } from "../SectionFrame";
import { Loaded, useApi } from "./shared";

const ROWS: { key: keyof Compare["difference"]; label: string; fmt: (v: number) => string; diff: (v: number) => string }[] = [
  { key: "cagr", label: "Annual return", fmt: (v) => pct(v), diff: (v) => signedPct(v) },
  { key: "volatility", label: "Volatility", fmt: (v) => pct(v), diff: (v) => signedPct(v) },
  { key: "sharpe", label: "Sharpe ratio", fmt: (v) => num(v), diff: (v) => signedNum(v) },
  { key: "max_drawdown", label: "Maximum drawdown", fmt: (v) => pct(v), diff: (v) => signedPct(v) },
  { key: "beta", label: "Beta to S&P 500", fmt: (v) => num(v), diff: (v) => signedNum(v) },
  { key: "var95_historical", label: "One-day VaR 95%", fmt: (v) => pct(v, 2), diff: (v) => signedPct(v, 2) }, // gitleaks:allow (field name, not a secret)
];

const SCEN: Record<string, string> = {
  dotcom: "Dot-com bust",
  gfc: "Financial crisis",
  euro_2011: "2011 euro crisis",
  q4_2018: "Q4 2018",
  covid: "COVID crash",
  bear_2022: "2022 bear market",
  tariff_2025: "2025 tariff shock",
};

function label(spec: string, demos: SectionProps["demos"], fallback: string) {
  const d = demoFor(spec, demos);
  return d ? d.name : fallback;
}

export function CompareSection({ spec, demos }: SectionProps) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const b = params.get("b") || "";
  const setB = (next: string) => {
    const q = new URLSearchParams(params.toString());
    if (next) q.set("b", next);
    else q.delete("b");
    router.replace(`${pathname}?${q.toString()}` as never, { scroll: false });
  };
  const aHold = parseSpec(spec);
  const others = demos.filter((d) => toSpec(normalized(parseSpec(d.p))) !== toSpec(normalized(aHold)));
  const state = useApi<Compare>(b ? apiUrl("compare", { a: spec, b }) : null);

  const picker = (
    <div className="section__block">
      <h3>Compare with</h3>
      <div className="demo-chips" role="group" aria-label="Portfolio to compare with">
        {others.map((d) => (
          <button key={d.id} type="button" className="chip" aria-pressed={demoFor(b, demos)?.id === d.id} onClick={() => setB(d.p)}>
            {d.name}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={!!b && !demoFor(b, demos)} onClick={() => setB(toSpec(aHold))}>
          A modified copy
        </button>
      </div>
      {b && !demoFor(b, demos) && (
        <PortfolioEditor
          key={b}
          initial={parseSpec(b)}
          onApply={(h: Holding[]) => setB(toSpec(h))}
          onCancel={() => setB("")}
        />
      )}
    </div>
  );

  if (!b)
    return (
      <article className="section">
        <header className="section__head">
          <h2 className="section__eyebrow">Compare</h2>
          <p className="section__answer">
            Put this portfolio next to another over the same dates, or test a change: add a holding, shift weights,
            and see what it does to return, risk and crisis losses.
          </p>
        </header>
        {picker}
      </article>
    );

  const aName = label(spec, demos, "This portfolio");
  const bName = label(b, demos, b === toSpec(aHold) ? "Modified copy" : "Comparison");

  return (
    <Loaded state={state} title="Compare">
      {(d, stale) => {
        const dv = d.difference;
        return (
          <SectionFrame
            title="Compare"
            stale={stale}
            method="performance"
            methodLabel="performance and risk metrics"
            answer={
              <>
                Over the same {num(d.window.trading_days / 252, 1)} years, {bName} returned{" "}
                {num(Math.abs(dv.cagr) * 100, 1)} percentage points a year {dv.cagr < 0 ? "less" : "more"} than{" "}
                {aName === "This portfolio" ? "this portfolio" : aName}, with {dv.volatility < 0 ? "lower" : "higher"}{" "}
                volatility ({pct(d.b.volatility)} against {pct(d.a.volatility)}) and a worst fall of{" "}
                {pct(Math.abs(d.b.max_drawdown))} against {pct(Math.abs(d.a.max_drawdown))}.
              </>
            }
          >
            {picker}
            {state.status === "ready" && Object.keys(d.b.holdings).length === 0 && <Notice>Nothing to compare yet.</Notice>}
            <Block title="Growth of $1" caption={`Common window ${date(d.window.start)} to ${date(d.window.end)}; both rebalanced daily to target weights.`}>
              <Legend
                items={[
                  { label: aName, color: "var(--series-1)" },
                  { label: bName, color: "var(--series-2)" },
                ]}
              />
              <LineChart
                x={d.growth.dates.map(isoToTime)}
                series={[
                  { id: "a", label: aName, values: d.growth.a, color: "var(--series-1)", endLabel: true },
                  { id: "b", label: bName, values: d.growth.b, color: "var(--series-2)", endLabel: true },
                ]}
                yFormat={(v) => `$${num(v, v < 10 ? 2 : 1)}`}
                refLines={[{ value: 1 }]}
                ariaLabel={`Growth of one dollar for ${aName} and ${bName}.`}
              />
            </Block>
            <Block title="Side by side">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th>{aName}</th>
                      <th>{bName}</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td>{r.fmt(d.a[r.key])}</td>
                        <td>{r.fmt(d.b[r.key])}</td>
                        <td>{r.diff(dv[r.key])}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>1-year simulation, 5th to 95th percentile</td>
                      <td>
                        {signedPct(d.a.simulation_1y.p5, 0)} to {signedPct(d.a.simulation_1y.p95, 0)}
                      </td>
                      <td>
                        {signedPct(d.b.simulation_1y.p5, 0)} to {signedPct(d.b.simulation_1y.p95, 0)}
                      </td>
                      <td />
                    </tr>
                    <tr>
                      <td>1-year chance of a loss</td>
                      <td>{pct(d.a.simulation_1y.probability_of_loss, 0)}</td>
                      <td>{pct(d.b.simulation_1y.probability_of_loss, 0)}</td>
                      <td>{signedPct(d.b.simulation_1y.probability_of_loss - d.a.simulation_1y.probability_of_loss, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Block>
            <Block title="In past crises" caption="Peak-to-trough returns, replayed as on the Stress tests page.">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Crisis</th>
                      <th>{aName}</th>
                      <th>{bName}</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(d.a.stress).map((k) => (
                      <tr key={k}>
                        <td>{SCEN[k] ?? k}</td>
                        <td>{pct(d.a.stress[k])}</td>
                        <td>{pct(d.b.stress[k])}</td>
                        <td>{signedPct(d.b.stress[k] - d.a.stress[k])}</td>
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
