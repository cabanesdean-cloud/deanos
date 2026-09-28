"use client";

import { pct } from "@/lib/format";
import { type Holding, normalized, parseSpec, toSpec } from "@/lib/portfolio";
import type { Demo } from "@/lib/types";

import { PortfolioEditor } from "./PortfolioEditor";

export function demoFor(spec: string, demos: Demo[]): Demo | undefined {
  const key = toSpec(normalized(parseSpec(spec)));
  return demos.find((d) => toSpec(normalized(parseSpec(d.p))) === key);
}

export function PortfolioBar({
  holdings,
  spec,
  demos,
  editing,
  onApply,
  onEdit,
  onDemo,
}: {
  holdings: Holding[];
  spec: string;
  demos: Demo[];
  editing: boolean;
  onApply: (h: Holding[]) => void;
  onEdit: (on: boolean) => void;
  onDemo: (spec: string) => void;
}) {
  const norm = normalized(holdings).sort((a, b) => b.weight - a.weight);
  const demo = demoFor(spec, demos);

  return (
    <div className="portfolio-bar">
      <div className="container">
        <div className="portfolio-bar__row">
          <div className="demo-chips" role="group" aria-label="Example portfolios">
            {demos.map((d) => (
              <button
                key={d.id}
                type="button"
                className="chip"
                aria-pressed={demo?.id === d.id}
                title={d.description}
                onClick={() => onDemo(d.p)}
              >
                {d.name}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={!demo || editing} onClick={() => onEdit(!editing)}>
              {demo ? "Build your own" : editing ? "Close editor" : "Edit portfolio"}
            </button>
          </div>
        </div>
        <div className="portfolio-bar__row" style={{ marginTop: 10 }}>
          <span className="portfolio-bar__name">
            {demo ? `${demo.name} (example)` : "Your portfolio"}
          </span>
          <span className="portfolio-bar__holdings">
            {norm.map((h) => (
              <span key={h.ticker}>
                <b>{h.ticker}</b> {pct(h.weight, 0)}
              </span>
            ))}
          </span>
        </div>
        <div className="weight-strip" aria-hidden>
          {norm.map((h) => (
            <span key={h.ticker} style={{ flexGrow: h.weight, flexBasis: 0 }} title={`${h.ticker} ${pct(h.weight)}`} />
          ))}
        </div>
        {demo && !editing && <p className="xsmall muted" style={{ marginTop: 8 }}>{demo.description} An illustration, not a recommendation.</p>}
        {editing && (
          <PortfolioEditor
            key={spec}
            initial={holdings}
            onApply={(h) => onApply(h)}
            onCancel={() => onEdit(false)}
          />
        )}
      </div>
    </div>
  );
}
