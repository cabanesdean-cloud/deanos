"use client";

import { useEffect, useState } from "react";

import { Notice, Skeleton } from "@/components/ui/States";
import { apiUrl, fetchApi, useApi } from "@/lib/api";
import { int, num, pct, range } from "@/lib/format";
import type { Demo, Factors, Overview, Regimes, Risk, Simulation, Stress, Volatility } from "@/lib/types";
import type { ValidationKind } from "@/content/methodology";

/** Fetch one section for each example portfolio. */
function useDemoResults<T>(path: string | null, extra: Record<string, string> = {}) {
  const demos = useApi<{ demos: Demo[] }>(apiUrl("demos"));
  const [rows, setRows] = useState<{ demo: Demo; data: T }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extraKey = JSON.stringify(extra);
  useEffect(() => {
    if (!path || demos.status !== "ready") return;
    let live = true;
    const ex = JSON.parse(extraKey) as Record<string, string>;
    Promise.all(demos.data.demos.map((d) => fetchApi<T>(apiUrl(path, { p: d.p, ...ex })).then((data) => ({ demo: d, data }))))
      .then((r) => live && setRows(r))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path, demos.status, demos.data, extraKey]);
  return { rows, error: error ?? (demos.status === "error" ? demos.error.message : null) };
}

function Frame({ rows, error, children }: { rows: unknown[] | null; error: string | null; children: () => React.ReactNode }) {
  if (error) return <Notice>Live validation results could not load: {error}</Notice>;
  if (!rows) return <Skeleton height={160} />;
  return <div className="table-wrap">{children()}</div>;
}

function VarValidation() {
  const { rows, error } = useDemoResults<Risk>("risk");
  return (
    <Frame rows={rows} error={error}>
      {() => (
        <table className="table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>Method</th>
              <th>Breaches / expected (95%)</th>
              <th>Kupiec p</th>
              <th>Christoffersen p</th>
              <th>Breaches / expected (99%)</th>
              <th>Kupiec p</th>
            </tr>
          </thead>
          <tbody>
            {rows!.flatMap(({ demo, data }) =>
              (["filtered_historical", "historical", "parametric"] as const).map((m, k) => {
                const r95 = data.backtest?.results[m]["95"];
                const r99 = data.backtest?.results[m]["99"];
                return (
                  <tr key={demo.id + m}>
                    <td>{k === 0 ? demo.name : ""}</td>
                    <td>{m === "filtered_historical" ? "Filtered historical" : m === "historical" ? "Historical" : "Parametric"}</td>
                    <td>{r95 ? `${int(r95.breaches)} / ${num(r95.expected, 1)}` : "n/a"}</td>
                    <td className={r95 && r95.kupiec.p_value < 0.05 ? "neg" : ""}>{num(r95?.kupiec.p_value)}</td>
                    <td className={r95 && r95.christoffersen.p_value < 0.05 ? "neg" : ""}>{num(r95?.christoffersen.p_value)}</td>
                    <td>{r99 ? `${int(r99.breaches)} / ${num(r99.expected, 1)}` : "n/a"}</td>
                    <td className={r99 && r99.kupiec.p_value < 0.05 ? "neg" : ""}>{num(r99?.kupiec.p_value)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

function GarchValidation() {
  const { rows, error } = useDemoResults<Volatility>("volatility");
  return (
    <Frame rows={rows} error={error}>
      {() => (
        <table className="table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>Method</th>
              <th>α</th>
              <th>β</th>
              <th>Persistence</th>
              <th>Half-life (days)</th>
              <th>Ljung-Box p, squared residuals</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map(({ demo, data }) => (
              <tr key={demo.id}>
                <td>{demo.name}</td>
                <td>{data.method.toUpperCase()}</td>
                <td>{num(data.parameters.alpha, 3)}</td>
                <td>{num(data.parameters.beta, 3)}</td>
                <td>{num(data.parameters.persistence, 3)}</td>
                <td>{num(data.parameters.half_life_days, 0)}</td>
                <td className={(data.diagnostics.squared_residuals?.p_value ?? 1) < 0.05 ? "neg" : ""}>
                  {num(data.diagnostics.squared_residuals?.p_value, 3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

function PerformanceValidation() {
  const { rows, error } = useDemoResults<Overview>("overview");
  return (
    <Frame rows={rows} error={error}>
      {() => (
        <table className="table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>CAGR</th>
              <th>90% range</th>
              <th>Sharpe</th>
              <th>90% range</th>
              <th>Max drawdown</th>
              <th>90% range</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map(({ demo, data }) => {
              const m = data.metrics;
              return (
                <tr key={demo.id}>
                  <td>{demo.name}</td>
                  <td>{pct(m.cagr)}</td>
                  <td>{range(m.intervals.cagr.low, m.intervals.cagr.high)}</td>
                  <td>{num(m.sharpe)}</td>
                  <td>{range(m.intervals.sharpe.low, m.intervals.sharpe.high, (v) => num(v))}</td>
                  <td>{pct(m.max_drawdown.depth)}</td>
                  <td>{range(m.intervals.max_drawdown.low, m.intervals.max_drawdown.high)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

function SimulationValidation() {
  const demos = useApi<{ demos: Demo[] }>(apiUrl("demos"));
  const p = demos.data?.demos[0]?.p;
  const [rows, setRows] = useState<{ block: number; data: Simulation }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!p) return;
    let live = true;
    Promise.all([1, 5, 21, 63].map((block) => fetchApi<Simulation>(apiUrl("simulation", { p, block })).then((data) => ({ block, data }))))
      .then((r) => live && setRows(r))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [p]);
  return (
    <Frame rows={rows} error={error}>
      {() => (
        <table className="table">
          <thead>
            <tr>
              <th>Block length (days)</th>
              <th>5th percentile</th>
              <th>Median</th>
              <th>95th percentile</th>
              <th>P(loss)</th>
              <th>Median worst drawdown along the path</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map(({ block, data }) => (
              <tr key={block}>
                <td>{block}</td>
                <td>{pct(data.final.p5 / data.start_value - 1)}</td>
                <td>{pct(data.final.p50 / data.start_value - 1)}</td>
                <td>{pct(data.final.p95 / data.start_value - 1)}</td>
                <td>{pct(data.probabilities.loss.p)}</td>
                <td>{pct(data.path_max_drawdown.p50)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

function RegimeValidation() {
  const demos = useApi<{ demos: Demo[] }>(apiUrl("demos"));
  const p = demos.data?.demos[0]?.p;
  const res = useApi<Regimes>(p ? apiUrl("regimes", { p }) : null);
  if (res.status === "error") return <Notice>Live validation results could not load: {res.error.message}</Notice>;
  if (res.status !== "ready") return <Skeleton height={160} />;
  const st = res.data.stability;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Seed</th>
            <th>Log-likelihood</th>
            <th>Daily agreement with best</th>
            <th>Calm/normal vs volatile/crisis agreement</th>
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
              <td className="left">{s.current}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FactorValidation() {
  const { rows, error } = useDemoResults<Factors>("factors");
  return (
    <Frame rows={rows} error={error}>
      {() => (
        <table className="table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>R²</th>
              <th>Market beta</th>
              <th>Alpha (annualized, 95% interval)</th>
              <th>Largest VIF</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map(({ demo, data }) => (
              <tr key={demo.id}>
                <td>{demo.name}</td>
                <td>{pct(data.r_squared, 0)}</td>
                <td>{num(data.loadings["Mkt-RF"].beta)}</td>
                <td>
                  {pct(data.alpha.annualized)} ({range(data.alpha.ci95[0], data.alpha.ci95[1])})
                </td>
                <td>{num(data.max_vif, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

function StressValidation() {
  const { rows, error } = useDemoResults<Stress>("stress");
  return (
    <Frame rows={rows} error={error}>
      {() => (
        <table className="table">
          <thead>
            <tr>
              <th>Scenario</th>
              {rows!.map(({ demo }) => (
                <th key={demo.id}>{demo.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows![0].data.scenarios.map((s, i) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                {rows!.map(({ demo, data }) => (
                  <td key={demo.id}>{pct(data.scenarios[i]?.share_replayed, 0)} replayed</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

export function Validation({ kind }: { kind: ValidationKind }) {
  switch (kind) {
    case "var":
      return <VarValidation />;
    case "garch":
      return <GarchValidation />;
    case "performance":
      return <PerformanceValidation />;
    case "simulation":
      return <SimulationValidation />;
    case "regimes":
      return <RegimeValidation />;
    case "factors":
      return <FactorValidation />;
    case "stress":
      return <StressValidation />;
    default:
      return null;
  }
}
