"use client";

import { useId, useMemo, useState } from "react";

import { apiUrl, useApi } from "@/lib/api";
import { pct } from "@/lib/format";
import { type Holding, MAX_HOLDINGS, normalized } from "@/lib/portfolio";
import type { Universe } from "@/lib/types";

type Row = { key: number; ticker: string; weight: string };

let nextKey = 1;
const toRows = (h: Holding[]): Row[] =>
  h.map((x) => ({ key: nextKey++, ticker: x.ticker, weight: String(+(x.weight * 100).toFixed(2)) }));

/** Edit tickers and weights. Nothing is saved: applying writes the portfolio into the URL. */
export function PortfolioEditor({
  initial,
  onApply,
  onCancel,
}: {
  initial: Holding[];
  onApply: (h: Holding[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length ? toRows(normalized(initial)) : [{ key: nextKey++, ticker: "", weight: "" }],
  );
  const uni = useApi<Universe>(apiUrl("universe"));
  const listId = useId();
  const byTicker = useMemo(
    () => new Map((uni.data?.tickers ?? []).map((t) => [t.ticker, t])),
    [uni.data],
  );

  const parsed = rows.map((r) => ({
    ...r,
    t: r.ticker.trim().toUpperCase().replace(/[./]/g, "-"),
    w: Number(r.weight),
  }));
  const filled = parsed.filter((r) => r.t || r.weight);
  const problems = filled.map((r) => {
    if (!r.t) return "Enter a ticker.";
    if (uni.data && !byTicker.has(r.t)) return `${r.t} is not in the data universe.`;
    if (!(r.w > 0)) return "Weight must be above zero.";
    if (parsed.filter((q) => q.t === r.t).length > 1) return `${r.t} appears twice.`;
    return null;
  });
  const total = filled.reduce((s, r) => s + (r.w > 0 ? r.w : 0), 0);
  const valid = filled.length > 0 && problems.every((p) => p === null);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply(filled.map((r) => ({ ticker: r.t, weight: r.w })));
      }}
    >
      <datalist id={listId}>
        {(uni.data?.tickers ?? []).map((t) => (
          <option key={t.ticker} value={t.ticker}>
            {t.name}
          </option>
        ))}
      </datalist>
      <div className="editor__rows">
        <div className="editor__row xsmall muted" aria-hidden>
          <span>Ticker</span>
          <span>Weight</span>
          <span />
        </div>
        {parsed.map((r, i) => {
          const info = byTicker.get(r.t);
          const problem = problems[filled.indexOf(r)] ?? null;
          return (
            <div key={r.key} className="editor__row">
              <input
                className="input"
                list={listId}
                aria-label={`Ticker ${i + 1}`}
                aria-invalid={problem ? true : undefined}
                value={r.ticker}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="e.g. VTI"
                onChange={(e) => update(r.key, { ticker: e.target.value })}
              />
              <input
                className="input"
                inputMode="decimal"
                enterKeyHint="go"
                aria-label={`Weight ${i + 1}`}
                value={r.weight}
                placeholder="%"
                onChange={(e) => update(r.key, { weight: e.target.value })}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${r.t || "row"}`}
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((q) => q.key !== r.key) : rs))}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 3l8 8M11 3l-8 8" strokeLinecap="round" />
                </svg>
              </button>
              {(problem || info) && (
                <div className="editor__meta" style={problem ? { color: "var(--neg)" } : undefined}>
                  {problem ??
                    `${info?.name ?? ""}${r.w > 0 && total > 0 ? ` · ${pct(r.w / total)} of portfolio` : ""}${
                      info?.first_date ? ` · data from ${info.first_date.slice(0, 4)}` : ""
                    }`}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="editor__foot">
        <button
          type="button"
          className="button button--small"
          disabled={rows.length >= MAX_HOLDINGS}
          onClick={() => setRows((rs) => [...rs, { key: nextKey++, ticker: "", weight: "" }])}
        >
          Add holding
        </button>
        <span className="xsmall muted">
          {filled.length}/{MAX_HOLDINGS} holdings. Weights are relative and rescaled to 100%.
        </span>
      </div>
      {uni.status === "error" && <p className="xsmall neg">Could not load the ticker list: {uni.error.message}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="button button--primary button--small" disabled={!valid}>
          Analyze portfolio
        </button>
        <button type="button" className="button button--ghost button--small" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="xsmall faint">
        Your portfolio lives only in this page&apos;s address. It is never stored, and no cookies are set.
      </p>
    </form>
  );
}
