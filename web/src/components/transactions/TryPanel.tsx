"use client";

import { useId, useState } from "react";

import { apiUrl, useApi } from "@/lib/api";
import { type Examples, MAX_DESCRIPTION, type TxInputs } from "@/lib/transactions";

/**
 * The descriptor being categorized. Submitting updates the page address, so
 * every prediction can be shared as a link.
 */
export function TryPanel({ inputs, onSubmit }: { inputs: TxInputs; onSubmit: (next: TxInputs) => void }) {
  const descId = useId();
  const amtId = useId();
  const [desc, setDesc] = useState(inputs.d);
  const [amt, setAmt] = useState(inputs.a === null ? "" : String(inputs.a));
  const examples = useApi<Examples>(apiUrl("transactions/examples"));

  const amtText = amt.trim().replace(/[$,]/g, "");
  const amtNum = amtText === "" ? null : Number(amtText);
  const amtValid = amtNum === null || (Number.isFinite(amtNum) && Math.abs(amtNum) <= 1_000_000);
  const descValid = desc.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (descValid && amtValid) onSubmit({ d: desc.trim().slice(0, MAX_DESCRIPTION), a: amtNum });
  };

  return (
    <div className="option-bar">
      <div className="container">
        <form className="tx-form" onSubmit={submit}>
          <div className="field tx-form__desc">
            <label htmlFor={descId} className="small muted">
              Statement description
            </label>
            <input
              id={descId}
              className="input"
              value={desc}
              maxLength={MAX_DESCRIPTION}
              onChange={(e) => setDesc(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-invalid={!descValid || undefined}
            />
          </div>
          <div className="field">
            <label htmlFor={amtId} className="small muted">
              Amount (optional; negative is money out)
            </label>
            <div className="tx-amount">
              <input
                id={amtId}
                className="input field__input"
                inputMode="decimal"
                enterKeyHint="go"
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
                aria-invalid={!amtValid || undefined}
                aria-describedby={!amtValid ? amtId + "-err" : undefined}
              />
              {/* The iOS decimal keypad has no minus key; phones get a sign switch instead. */}
              <button
                type="button"
                className="button touch-only tx-sign"
                aria-label="Switch between money in and money out"
                onClick={() => setAmt((v) => (v.trim().startsWith("-") ? v.trim().slice(1) : "-" + v.trim()))}
              >
                ±
              </button>
            </div>
          </div>
          <button type="submit" className="button button--primary" disabled={!descValid || !amtValid}>
            Categorize
          </button>
        </form>
        {!amtValid && (
          <p id={amtId + "-err"} className="xsmall neg" style={{ marginTop: 6 }}>
            Enter an amount between −1,000,000 and 1,000,000, or leave it empty.
          </p>
        )}
        {examples.status === "ready" && (
          <div className="tx-presets">
            <span className="small muted" id={descId + "-ex"}>
              Examples
            </span>
            <div className="demo-chips" role="group" aria-labelledby={descId + "-ex"}>
              {examples.data.presets.map((p) => {
                const active = p.description === inputs.d && p.amount === inputs.a;
                return (
                  <button
                    key={p.description}
                    type="button"
                    className="chip"
                    aria-pressed={active}
                    title={p.note}
                    onClick={() => onSubmit({ d: p.description, a: p.amount })}
                  >
                    {p.note}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
