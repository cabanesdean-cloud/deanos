"use client";

import { useId, useState } from "react";

import { Segmented, Slider } from "@/components/ui/Controls";
import { apiUrl, ApiError, fetchApi } from "@/lib/api";
import { date, pct } from "@/lib/format";
import { type HistoricalVol, LIMITS, money, type OptionInputs, yearsLabel } from "@/lib/options";

/**
 * The option being priced. Sliders update the page address when released, so
 * every state can be shared as a link; dragging only moves the local value.
 */
export function InputsPanel({
  inputs,
  onChange,
  seedNote,
  onSeed,
}: {
  inputs: OptionInputs;
  onChange: (next: OptionInputs) => void;
  seedNote: string | null;
  onSeed: (note: string | null) => void;
}) {
  const [draft, setDraft] = useState(inputs);
  const commit = (patch: Partial<OptionInputs>) => {
    onSeed(null); // the ticker note no longer describes the inputs
    onChange({ ...draft, ...patch });
  };
  const slide = (key: "T" | "r" | "q" | "v") => ({
    value: draft[key],
    min: LIMITS[key].min,
    max: LIMITS[key].max,
    step: LIMITS[key].step,
    onChange: (v: number) => setDraft((d) => ({ ...d, [key]: v })),
    onCommit: (v: number) => commit({ [key]: v }),
  });

  return (
    <div className="option-bar">
      <div className="container">
        <div className="option-bar__row">
          <Segmented
            label="Option"
            value={draft.type}
            onChange={(type) => commit({ type })}
            options={[
              { value: "call", label: "Call" },
              { value: "put", label: "Put" },
            ]}
          />
          <Segmented
            label="Exercise"
            value={draft.style}
            onChange={(style) => commit({ style })}
            options={[
              { value: "european", label: "European" },
              { value: "american", label: "American" },
            ]}
          />
          <PriceField label="Spot price" value={draft.S} onCommit={(S) => commit({ S })} />
          <PriceField label="Strike price" value={draft.K} onCommit={(K) => commit({ K })} />
        </div>
        <div className="option-bar__sliders">
          <Slider label="Time to expiry" format={yearsLabel} {...slide("T")} />
          <Slider label="Volatility" format={(v) => v.toFixed(0) + "% a year"} {...slide("v")} />
          <Slider label="Risk-free rate" format={(v) => v.toFixed(2) + "%"} {...slide("r")} />
          <Slider label="Dividend yield" format={(v) => v.toFixed(2) + "%"} {...slide("q")} />
        </div>
        <TickerSeed
          onSeed={(h) => {
            const vol = h.realized_vol["3m"] ?? h.realized_vol["1m"];
            if (vol == null) return;
            const spot = Math.round(h.last_close * 100) / 100;
            const v = Math.min(LIMITS.v.max, Math.max(LIMITS.v.min, Math.round(vol * 100)));
            onSeed(
              h.ticker + ": close " + money(spot) + " on " + date(h.last_date) + ", 3-month realized volatility " + pct(vol) +
                ". Strike set to the nearest round number at the money. Realized volatility looks backward; option markets price expected volatility.",
            );
            onChange({ ...draft, S: spot, K: roundStrike(spot), v });
          }}
        />
        {seedNote && (
          <p className="xsmall muted" style={{ marginTop: 8 }} role="status">
            {seedNote}
          </p>
        )}
      </div>
    </div>
  );
}

function roundStrike(spot: number): number {
  const step = spot >= 500 ? 10 : spot >= 100 ? 5 : spot >= 20 ? 1 : 0.5;
  return Math.max(LIMITS.K.min, Math.round(spot / step) * step);
}

function PriceField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(n) && n >= LIMITS.S.min && n <= LIMITS.S.max;
  const submit = () => {
    if (valid && n !== value) onCommit(n);
  };
  return (
    <div className="field">
      <label htmlFor={id} className="small muted">
        {label}
      </label>
      <input
        id={id}
        className="input field__input"
        inputMode="decimal"
        value={text}
        aria-invalid={!valid || undefined}
        aria-describedby={!valid ? id + "-err" : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      {!valid && (
        <span id={id + "-err"} className="xsmall neg">
          Enter a price between 0.01 and 1,000,000
        </span>
      )}
    </div>
  );
}

function TickerSeed({ onSeed }: { onSeed: (h: HistoricalVol) => void }) {
  const id = useId();
  const [ticker, setTicker] = useState("SPY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,12}$/.test(t)) {
      setError("Enter a ticker such as SPY or AAPL.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSeed(await fetchApi<HistoricalVol>(apiUrl("options/historical-vol", { ticker: t })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load that ticker.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="option-bar__seed">
      <summary>Start from a real stock or ETF</summary>
      <form className="option-bar__seed-form" onSubmit={run}>
        <label htmlFor={id} className="small muted">
          Ticker (S&amp;P 500 stocks and major ETFs)
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input id={id} className="input" style={{ width: 120 }} value={ticker} onChange={(e) => setTicker(e.target.value)} autoComplete="off" spellCheck={false} />
          <button type="submit" className="button button--small" disabled={busy}>
            {busy ? "Loading…" : "Use its last close and realized volatility"}
          </button>
        </div>
        {error && <p className="xsmall neg" role="alert">{error}</p>}
      </form>
    </details>
  );
}
