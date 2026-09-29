"use client";

import { Notice, Skeleton } from "@/components/ui/States";
import { apiUrl, useApi } from "@/lib/api";
import { int, num, pct } from "@/lib/format";
import { money, type OptionsValidation, type TextbookRow } from "@/lib/options";

type Kind = "options-bs" | "options-mc" | "options-binomial" | "options-iv";

function fixed(v: number, d: number): string {
  return num(v, d);
}

function TextbookTable({ rows, source }: { rows: TextbookRow[]; source: string }) {
  return (
    <div className="table-wrap" tabIndex={0}>
      <table className="table">
        <thead>
          <tr>
            <th className="left">Case</th>
            <th>Textbook</th>
            <th>Engine</th>
            <th>Match</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="left">{r.label}</td>
              <td>{fixed(r.expected, r.decimals)}</td>
              <td>{fixed(r.computed, r.decimals + 2)}</td>
              <td className={r.matches ? "" : "neg"}>{r.matches ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="xsmall muted" style={{ marginTop: 8 }}>
        Source: {source}.
      </p>
    </div>
  );
}

/** Live validation tables for the options models, from the engine's validation endpoint. */
export function OptionsValidationTable({ kind }: { kind: Kind }) {
  const state = useApi<OptionsValidation>(apiUrl("options/validation"));
  if (state.status === "loading") return <Skeleton height={160} />;
  if (state.status === "error") return <Notice>Live validation results could not load: {state.error.message}</Notice>;
  const d = state.data;
  const tb = (models: string[]) => d.textbook.filter((r) => models.includes(r.model));

  if (kind === "options-bs") return <TextbookTable rows={tb(["black-scholes", "greeks"])} source={d.source} />;

  if (kind === "options-mc") {
    const m = d.monte_carlo;
    const i = m.inputs;
    return (
      <div className="table-wrap" tabIndex={0}>
        <table className="table">
          <tbody>
            <tr>
              <td className="left">Option</td>
              <td>
                {String(i.kind)} S={String(i.s)} K={String(i.k)} T={String(i.t)} r={pct(Number(i.r), 0)} q={pct(Number(i.q), 0)} σ=
                {pct(Number(i.sigma), 0)}
              </td>
            </tr>
            <tr>
              <td className="left">Exact Black-Scholes price</td>
              <td>{money(m.black_scholes)}</td>
            </tr>
            <tr>
              <td className="left">Independent runs × paths each</td>
              <td>
                {int(m.runs)} × {int(m.paths)}
              </td>
            </tr>
            <tr>
              <td className="left">95% intervals containing the exact price</td>
              <td className={Math.abs(m.coverage - 0.95) > 0.02 ? "neg" : ""}>{pct(m.coverage, 1)}</td>
            </tr>
            <tr>
              <td className="left">Average error (bias)</td>
              <td>{num(m.mean_error, 4)}</td>
            </tr>
            <tr>
              <td className="left">Root-mean-square error</td>
              <td>{num(m.rmse, 4)}</td>
            </tr>
            <tr>
              <td className="left">Variance reduction: antithetic / antithetic + control</td>
              <td>
                ×{num(m.variance_reduction.antithetic, 1)} / ×{num(m.variance_reduction.antithetic_control, 1)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (kind === "options-binomial") {
    const b = d.binomial;
    return (
      <>
        <TextbookTable rows={tb(["binomial"])} source={d.source} />
        <div className="table-wrap" tabIndex={0} style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th className="left">Steps</th>
                <th>European put (tree)</th>
                <th>Black-Scholes</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.steps}>
                  <td className="left">{int(r.steps)}</td>
                  <td>{num(r.price, 4)}</td>
                  <td>{num(b.black_scholes, 4)}</td>
                  <td>{num(r.error, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="xsmall muted" style={{ marginTop: 8 }}>
            Put with S=K={String(b.inputs.s)}, T={String(b.inputs.t)}, r={pct(Number(b.inputs.r), 0)}, q={pct(Number(b.inputs.q), 0)}, σ=
            {pct(Number(b.inputs.sigma), 0)}. The error roughly halves each time the steps double.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <TextbookTable rows={tb(["implied-vol"])} source={d.source} />
      <p className="small" style={{ marginTop: 16 }}>
        Round trips: {int(d.implied_vol.cases)} prices computed at known volatilities (5% to 100%, strikes 60 to 150,
        expiries one week to five years, calls and puts) were solved back to volatility. Largest error:{" "}
        {d.implied_vol.max_abs_error.toExponential(1)}. {int(d.implied_vol.skipped_at_bounds)} cases whose price is
        indistinguishable from a no-arbitrage bound were excluded, since they carry no information about volatility.
      </p>
    </>
  );
}
