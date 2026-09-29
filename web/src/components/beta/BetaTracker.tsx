"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { IntervalPlot } from "@/components/charts/IntervalPlot";
import { LineChart } from "@/components/charts/LineChart";
import { Scatter } from "@/components/charts/Scatter";
import { isoToTime } from "@/components/charts/axes";
import { Segmented } from "@/components/ui/Controls";
import { Legend } from "@/components/ui/Legend";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { Notice, Skeleton, SlowNote } from "@/components/ui/States";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { apiUrl, useApi } from "@/lib/api";
import {
  apiParams,
  BENCHMARKS,
  type BetaParams,
  type BetaResult,
  cleanTicker,
  FREQUENCIES,
  LOOKBACKS,
  PERIOD,
  readParams,
  toQuery,
  WINDOWS,
} from "@/lib/beta";
import { date, int, num, plural, trimNum } from "@/lib/format";
import { SITE } from "@/lib/site";
import type { Universe } from "@/lib/types";

const EXAMPLES = ["NVDA", "AAPL", "KO", "XLU", "GLD"];
const pctTick = (v: number) => `${trimNum(v * 100, 1)}%`;
const pct1 = (v: number) => `${trimNum(v * 100, 2)}%`;
const pValue = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`);

export function BetaTracker() {
  const params = useSearchParams();
  const router = useRouter();
  const p = readParams((k) => params.get(k));
  const set = (patch: Partial<BetaParams>) => {
    const q = toQuery({ ...p, ...patch });
    router.replace((q ? `/beta?${q}` : "/beta") as never, { scroll: false });
  };

  const uni = useApi<Universe>(apiUrl("universe"));
  const byTicker = useMemo(() => new Map((uni.data?.tickers ?? []).map((t) => [t.ticker, t])), [uni.data]);
  const res = useApi<BetaResult>(apiUrl("beta", apiParams(p)));

  return (
    <>
      <Controls p={p} set={set} byTicker={byTicker} universeReady={uni.status === "ready"} />
      <div className="beta-results">
        {res.status === "loading" && (
          <div aria-busy="true" aria-label="Loading results">
            <div className="skeleton" style={{ height: 20, maxWidth: 560 }} />
            <SlowNote loading />
            <Skeleton height={96} />
            <Skeleton height={360} />
          </div>
        )}
        {res.status === "error" && (
          <Notice tone="error">
            {res.error.status === 400 || res.error.status === 422 ? res.error.message : `The analysis could not load. ${res.error.message}`}
            {res.error.status !== 400 && res.error.status !== 422 && (
              <>
                {" "}
                <button type="button" className="button button--small" onClick={res.retry}>
                  Try again
                </button>
              </>
            )}
          </Notice>
        )}
        {res.status === "ready" && <Results d={res.data} stale={res.stale} />}
      </div>
    </>
  );
}

function Controls({
  p,
  set,
  byTicker,
  universeReady,
}: {
  p: BetaParams;
  set: (patch: Partial<BetaParams>) => void;
  byTicker: Map<string, Universe["tickers"][number]>;
  universeReady: boolean;
}) {
  const listId = useId();
  const assetId = useId();
  const benchId = useId();
  const [text, setText] = useState(p.asset);
  const [lastAsset, setLastAsset] = useState(p.asset);
  if (lastAsset !== p.asset) {
    setLastAsset(p.asset);
    setText(p.asset);
  }
  const [problem, setProblem] = useState<string | null>(null);
  const commit = (raw: string) => {
    const t = cleanTicker(raw);
    if (!t) return setProblem("Enter a ticker, like NVDA.");
    if (universeReady && !byTicker.has(t)) return setProblem(`${t} is not in the data universe (S&P 500 stocks plus major ETFs).`);
    if (t === p.benchmark) return setProblem("Pick an asset that is different from the benchmark.");
    setProblem(null);
    set({ asset: t });
  };
  const benchOptions = [...BENCHMARKS.filter((b) => !universeReady || byTicker.has(b))];
  if (!benchOptions.includes(p.benchmark as (typeof BENCHMARKS)[number])) benchOptions.push(p.benchmark as never);
  const advanced = p.freq !== "daily" || p.ret !== "log" || p.window !== 60 || p.winsorize;

  return (
    <div className="beta-controls">
      <form
        className="beta-controls__row"
        onSubmit={(e) => {
          e.preventDefault();
          commit(text);
        }}
      >
        <datalist id={listId}>
          {[...byTicker.values()].map((t) => (
            <option key={t.ticker} value={t.ticker}>
              {t.name}
            </option>
          ))}
        </datalist>
        <div className="field">
          <label htmlFor={assetId} className="small muted">
            Stock or ETF
          </label>
          <div className="beta-controls__asset">
            <input
              id={assetId}
              className="input"
              list={listId}
              value={text}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-invalid={problem ? true : undefined}
              aria-describedby={`${assetId}-hint`}
              onChange={(e) => {
                setText(e.target.value);
                setProblem(null);
                // A pick from the suggestion list arrives without a typing inputType: apply it straight away.
                const ne = e.nativeEvent as InputEvent;
                if (!ne.inputType || ne.inputType === "insertReplacementText") commit(e.target.value);
              }}
            />
            <button type="submit" className="button button--primary">
              Analyze
            </button>
          </div>
          <span id={`${assetId}-hint`} className="xsmall" style={problem ? { color: "var(--neg)" } : undefined}>
            {problem ?? byTicker.get(p.asset)?.name ?? "Type to search S&P 500 stocks and major ETFs"}
          </span>
        </div>
        <div className="field">
          <label htmlFor={benchId} className="small muted">
            Benchmark
          </label>
          <select
            id={benchId}
            className="select"
            value={p.benchmark}
            onChange={(e) => (e.target.value === p.asset ? setProblem("Pick a benchmark that is different from the asset.") : set({ benchmark: e.target.value }))}
          >
            {benchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
                {byTicker.get(b)?.name ? ` · ${byTicker.get(b)?.name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Segmented label="History" value={p.lookback} options={LOOKBACKS} onChange={(v) => set({ lookback: v })} />
      </form>
      <div className="demo-chips beta-examples" role="group" aria-label="Example assets">
        <span className="xsmall muted">Try</span>
        {EXAMPLES.filter((t) => !universeReady || byTicker.has(t)).map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={p.asset === t} onClick={() => commit(t)}>
            {t}
          </button>
        ))}
      </div>
      <details className="beta-advanced" open={advanced || undefined}>
        <summary>Advanced settings</summary>
        <div className="beta-controls__row">
          <Segmented label="Return frequency" value={p.freq} options={FREQUENCIES} onChange={(v) => set({ freq: v })} />
          <Segmented
            label="Returns"
            value={p.ret}
            options={[
              { value: "log", label: "Log" },
              { value: "simple", label: "Simple" },
            ]}
            onChange={(v) => set({ ret: v })}
          />
          <Segmented
            label="Rolling window (periods)"
            value={String(p.window)}
            options={WINDOWS.map((w) => ({ value: String(w), label: String(w) }))}
            onChange={(v) => set({ window: Number(v) })}
          />
          <label className="beta-check small">
            <input type="checkbox" checked={p.winsorize} onChange={(e) => set({ winsorize: e.target.checked })} />
            Winsorize both series at the 1st and 99th percentiles
          </label>
        </div>
      </details>
    </div>
  );
}

function Results({ d, stale }: { d: BetaResult; stale: boolean }) {
  const phone = useMediaQuery("(max-width: 767px)");
  const q = d.quadratic;
  const dq = d.data_quality;
  const word = PERIOD[dq.frequency];
  const a = d.asset.ticker;
  const b = d.benchmark.ticker;
  const lv = new Map(q.sensitivity_levels.map((r) => [Math.round(r.benchmark_return * 1000) / 1000, r]));
  const level = [0.02, 0.01].find((x) => lv.get(-x)?.within_range && lv.get(x)?.within_range) ?? 0.01;
  const down = lv.get(-level)!;
  const up = lv.get(level)!;
  const curved = q.b2.p_value < 0.05;
  const curve = q.curve;
  const sc = d.scatter;
  const xg = curve.benchmark_return;
  const shownBuckets = d.buckets.filter((k) => k.beta);
  const missingBuckets = d.buckets.length - shownBuckets.length;

  return (
    <article className={`beta-result${stale ? " is-stale" : ""}`} aria-busy={stale || undefined}>
      <p className="beta-window">
        <b>{a}</b>
        {d.asset.name ? ` (${d.asset.name})` : ""} against <b>{b}</b>
        {d.benchmark.name ? ` (${d.benchmark.name})` : ""}: {dq.frequency} {dq.return_type} returns, {date(dq.start)} to {date(dq.end)},{" "}
        {plural(d.observations, word)}. Prices as of {date(d.as_of)}.
      </p>
      {dq.limited_by_history && (
        <Notice>
          The shared history starts on {date(dq.shared_history_start)}, later than the {dq.lookback === "max" ? "full" : dq.lookback} window
          asked for, so the window is shorter.
        </Notice>
      )}

      <StatGrid>
        <Stat label="Beta, straight line" value={num(d.linear.beta.estimate)} range={`95% interval ${num(d.linear.beta.ci_low)} to ${num(d.linear.beta.ci_high)}`} />
        <Stat
          label={`Sensitivity on a ${pctTick(-level)} ${b} ${word}`}
          value={num(down.estimate)}
          range={`${num(down.ci_low)} to ${num(down.ci_high)}; ${plural(down.observations_beyond, word)} at ${pctTick(-level)} or lower`}
        />
        <Stat
          label={`Sensitivity on a +${pctTick(level)} ${b} ${word}`}
          value={num(up.estimate)}
          range={`${num(up.ci_low)} to ${num(up.ci_high)}; ${plural(up.observations_beyond, word)} at +${pctTick(level)} or higher`}
        />
        <Stat
          label="Curvature"
          value={curved ? "Detected" : "Not detected"}
          range={`β₂ ${num(q.b2.estimate)}, ${pValue(q.b2.p_value)}; ${q.r_squared_gain * 100 < 0.05 ? "R² barely changes" : `R² +${trimNum(q.r_squared_gain * 100, 1)} pts`}`}
        />
      </StatGrid>

      <div className="beta-findings">
        {d.findings.map((f) => (
          <p key={f}>{f}</p>
        ))}
      </div>

      <section className="section__block">
        <h3>
          Each {word}: {b} return across, {a} return up
        </h3>
        <Legend
          items={[
            { label: `${plural(d.observations, word)}`, color: "var(--series-1)", kind: "swatch" },
            { label: "Straight line (conventional beta)", color: "var(--reference)", kind: "dashed" },
            { label: "Quadratic fit (the curve)", color: "var(--series-2)" },
          ]}
        />
        <Scatter
          x={sc.benchmark}
          y={sc.asset}
          lines={[
            { id: "lin", label: "Straight line", x: xg, y: curve.linear_fitted_return, color: "var(--reference)", dash: "6 4", width: 2 },
            { id: "quad", label: "Quadratic fit", x: xg, y: curve.fitted_return, color: "var(--series-2)", width: 2.5 },
          ]}
          format={pctTick}
          xLabel={`${b} return`}
          yLabel={`${a} return`}
          height={phone ? 300 : 400}
          ariaLabel={`Scatter plot of ${plural(d.observations, word)} of ${a} returns against ${b} returns, with a straight-line fit of slope ${num(d.linear.beta.estimate)} and a quadratic fit.`}
          readout={(i) => {
            const x = sc.benchmark[i];
            const lin = d.linear.alpha + d.linear.beta.estimate * x;
            const cur = q.alpha + q.b1.estimate * x + q.b2.estimate * x * x;
            return (
              <>
                <span>{date(sc.dates[i])}</span>
                <span>
                  {b} <b className="label-strong">{pct1(x)}</b>
                </span>
                <span>
                  {a} <b className="label-strong">{pct1(sc.asset[i])}</b>
                </span>
                <span className="muted">
                  line {pct1(lin)}, curve {pct1(cur)}
                </span>
              </>
            );
          }}
        />
        <p className="figure__caption">
          Every point is one {word}. Darker areas are where points overlap. The axes cover every observation, including
          the extremes, which are few. The curve is drawn only across the 0.5th to 99.5th percentile of {b} returns, where
          there is data.
        </p>
      </section>

      <section className="section__block">
        <h3>How sensitive, at each size of {b} move</h3>
        <Legend
          items={[
            { label: "Slope of the curve", color: "var(--series-2)" },
            { label: "95% interval", color: "var(--band-outer)", kind: "swatch" },
            { label: `Straight-line beta ${num(d.linear.beta.estimate)}`, color: "var(--fg-3)", kind: "dashed" },
          ]}
        />
        <LineChart
          x={xg}
          xType="linear"
          xFormat={pctTick}
          series={[{ id: "s", label: "Sensitivity", values: curve.sensitivity, color: "var(--series-2)" }]}
          bands={[{ id: "ci", lower: curve.ci_low, upper: curve.ci_high, fill: "var(--band-outer)" }]}
          refLines={[{ value: d.linear.beta.estimate }]}
          yFormat={(v) => num(v, Math.abs(v) >= 10 ? 0 : 1)}
          height={phone ? 200 : 240}
          ariaLabel={`Estimated sensitivity of ${a} to ${b}, from ${num(curve.sensitivity[0])} at a ${pctTick(xg[0])} move to ${num(curve.sensitivity.at(-1))} at a ${pctTick(xg.at(-1) ?? 0)} move.`}
          readout={(i) => (
            <>
              <span>
                {b} {pct1(xg[i])}
              </span>
              <span>
                sensitivity <b className="label-strong">{num(curve.sensitivity[i])}</b> (95% interval {num(curve.ci_low[i])} to {num(curve.ci_high[i])})
              </span>
            </>
          )}
        />
        <p className="figure__caption">
          The slope of the quadratic fit, β₁ + 2·β₂·x, at each {b} return x: how much {a} moved per 1% of {b} around
          that point. A flat line matching the straight-line beta means the curve adds nothing. The band widens toward
          the ends because extreme moves are rare.
        </p>
      </section>

      <section className="section__block">
        <h3>Beta within slices of {b} returns</h3>
        <IntervalPlot
          rows={shownBuckets.map((k) => ({
            id: k.label,
            label: `${k.label} (${int(k.n)})`,
            value: k.beta!.estimate,
            low: k.beta!.ci_low,
            high: k.beta!.ci_high,
            muted: k.sparse,
            note: (
              <>
                {b} from {pct1(k.benchmark_low ?? 0)} to {pct1(k.benchmark_high ?? 0)}
                {k.sparse ? "; few observations" : ""}
              </>
            ),
          }))}
          format={(v) => num(v)}
          refValue={d.linear.beta.estimate}
          refLabel="Straight-line beta"
          ariaLabel={`Betas of ${a} within six percentile bands of ${b} returns.`}
        />
        <p className="figure__caption">
          A separate straight line within each percentile band of {b} returns, lowest first (the original tracker&apos;s
          buckets). These are conditional estimates. Each covers a narrow range of moves, so the intervals are wide, and
          different betas across buckets do not on their own prove a curved relationship.
          {missingBuckets > 0 && ` ${plural(missingBuckets, "bucket")} had too few observations to estimate.`}
        </p>
      </section>

      <details className="beta-advanced">
        <summary>Diagnostics: rolling beta, volatility regimes, stability and the regression table</summary>
        <Diagnostics d={d} />
      </details>

      <footer className="section__method">
        <Link href="/methodology/beta-tracker">How this is calculated</Link>
        <span>
          Adjusted closes (splits and dividends), {dq.return_type} returns, no risk-free adjustment
          {dq.skipped_gaps > 0 ? `, ${plural(dq.skipped_gaps, "gap")} in shared prices skipped, not filled` : ", nothing forward-filled"}
          {d.winsorized ? ", winsorized at 1%/99%" : ""}
        </span>
        <span>Prices as of {date(d.as_of)}</span>
      </footer>
    </article>
  );
}

function Diagnostics({ d }: { d: BetaResult }) {
  const word = PERIOD[d.data_quality.frequency];
  const r = d.rolling;
  const vr = d.volatility_regimes;
  const q = d.quadratic;
  return (
    <div className="beta-diagnostics">
      <section className="section__block">
        <h3>Rolling {r.window}-{word} estimates</h3>
        <Legend
          items={[
            { label: "Straight-line beta", color: "var(--series-1)" },
            { label: "Curve's slope at a flat benchmark (β₁)", color: "var(--series-2)" },
          ]}
        />
        {r.dates.length > 1 ? (
          <LineChart
            x={r.dates.map(isoToTime)}
            series={[
              { id: "b", label: "Beta", values: r.beta, color: "var(--series-1)", width: 1.5 },
              { id: "b1", label: "β₁", values: r.b1, color: "var(--series-2)", width: 1.25 },
            ]}
            yFormat={(v) => num(v, 1)}
            height={200}
            ariaLabel={`Rolling ${r.window}-${word} beta over the window.`}
          />
        ) : (
          <p className="muted small">Not enough history for a rolling window.</p>
        )}
        <p className="figure__caption">Each point uses only the {r.window} {word}s ending that date. Wide swings mean one full-window number hides a lot.</p>
      </section>

      <section className="section__block">
        <h3>Calmer and turbulent periods</h3>
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th>Periods</th>
                <th>Observations</th>
                <th>Beta</th>
                <th>95% interval</th>
              </tr>
            </thead>
            <tbody>
              {vr.regimes.map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td>{int(g.n)}</td>
                  <td>{g.beta ? num(g.beta.estimate) : "n/a"}</td>
                  <td>{g.beta ? `${num(g.beta.ci_low)} to ${num(g.beta.ci_high)}` : "too few"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="figure__caption">
          Split at the median of the benchmark&apos;s volatility over the previous {vr.window} {word}s
          {vr.median_vol != null ? ` (${pct1(vr.median_vol)} per ${word})` : ""}.
        </p>
      </section>

      <section className="section__block">
        <h3>Stability of the fit</h3>
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th>Sample</th>
                <th>Observations</th>
                <th>Beta</th>
                <th>β₁</th>
                <th>β₂ (curvature)</th>
              </tr>
            </thead>
            <tbody>
              {d.stability.map((s) => (
                <tr key={s.label}>
                  <td>
                    {s.label}
                    <div className="xsmall muted">{s.span}</div>
                  </td>
                  <td>{int(s.n)}</td>
                  <td>{s.beta != null ? num(s.beta) : "n/a"}</td>
                  <td>{s.b1 != null ? num(s.b1) : "n/a"}</td>
                  <td>{s.b2 != null ? `${num(s.b2, 1)} (${pValue(s.b2_p_value ?? 1)})` : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="figure__caption">If the curvature changes sign or loses significance between halves, or without the most extreme 1% of {word}s, treat it as fragile.</p>
      </section>

      <section className="section__block">
        <h3>Sensitivity at the original tracker&apos;s reporting points</h3>
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th>Benchmark move</th>
                <th>Sensitivity</th>
                <th>95% interval</th>
                <th>Observations at least this far</th>
              </tr>
            </thead>
            <tbody>
              {q.sensitivity_levels.map((l) => (
                <tr key={l.benchmark_return}>
                  <td>{l.benchmark_return > 0 ? "+" : ""}{pctTick(l.benchmark_return)}</td>
                  <td>{num(l.estimate)}</td>
                  <td>{`${num(l.ci_low)} to ${num(l.ci_high)}`}</td>
                  <td>{l.benchmark_return === 0 ? "n/a" : `${int(l.observations_beyond)}${l.within_range ? "" : " (outside the curve's range)"}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section__block">
        <h3>Regression coefficients</h3>
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Coefficient</th>
                <th>Estimate</th>
                <th>Robust SE (HC1)</th>
                <th>Classical SE</th>
                <th>p (robust)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Straight line", "β", d.linear.beta],
                ["Quadratic", "β₁", q.b1],
                ["Quadratic", "β₂", q.b2],
              ].map(([m, c, s]) => {
                const v = s as BetaResult["linear"]["beta"];
                return (
                  <tr key={`${m}${c}`}>
                    <td>{m as string}</td>
                    <td>{c as string}</td>
                    <td>{num(v.estimate, 3)}</td>
                    <td>{num(v.se, 3)}</td>
                    <td>{num(v.se_classical, 3)}</td>
                    <td>{pValue(v.p_value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="figure__caption">
          R² {num(d.linear.r_squared, 3)} for the straight line and {num(q.r_squared, 3)} for the quadratic, both in sample. A higher in-sample R² is not
          evidence that the curve predicts better.
        </p>
      </section>
      {SITE.githubUrl && (
        <p className="xsmall muted">
          Source: <a href={`${SITE.githubUrl}/blob/main/engine/deanos_engine/models/beta.py`}>engine/deanos_engine/models/beta.py</a> and its tests in{" "}
          <a href={`${SITE.githubUrl}/blob/main/engine/tests/test_beta.py`}>engine/tests/test_beta.py</a>.
        </p>
      )}
    </div>
  );
}
