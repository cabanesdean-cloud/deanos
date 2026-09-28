"use client";

import { scaleLinear } from "d3-scale";
import { type ReactNode, useState } from "react";

import { textWidth } from "./axes";
import { useWidth } from "./useWidth";

export type DumbbellRow = { id: string; label: string; a: number; b: number; note?: ReactNode };

/** Two values per row on a shared axis: series A (solid) against reference B (hollow). */
export function Dumbbell({
  rows,
  aLabel,
  bLabel,
  format,
  ariaLabel,
  onSelect,
  selected,
}: {
  rows: DumbbellRow[];
  aLabel: string;
  bLabel: string;
  format: (v: number) => string;
  ariaLabel: string;
  onSelect?: (id: string) => void;
  selected?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const rowH = 40;
  const labelW = Math.min(Math.max(...rows.map((r) => textWidth(r.label))) + 16, width * 0.4);
  const innerW = Math.max(0, width - labelW - 16);
  const lo = Math.min(0, ...rows.flatMap((r) => [r.a, r.b]));
  const hi = Math.max(0, ...rows.flatMap((r) => [r.a, r.b]));
  const x = scaleLinear().domain([lo, hi]).nice(4).range([0, innerW]);
  const ticks = x.ticks(Math.max(2, Math.floor(innerW / 70)));
  const height = rows.length * rowH + 24;
  const active = hover ?? selected ?? null;

  return (
    <div className="chart" ref={ref}>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span className="legend__item">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="5" fill="var(--series-1)" />
          </svg>
          {aLabel}
        </span>
        <span className="legend__item">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="4.5" fill="var(--bg)" stroke="var(--reference)" strokeWidth="2" />
          </svg>
          {bLabel}
        </span>
      </div>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${labelW},0)`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? "zero-line" : "grid-line"} x1={x(t)} x2={x(t)} y2={rows.length * rowH} />
                <text x={x(t)} y={rows.length * rowH + 16} textAnchor="middle">
                  {format(t)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cy = i * rowH + rowH / 2;
              const isActive = active === r.id;
              return (
                <g
                  key={r.id}
                  style={{ cursor: onSelect ? "pointer" : undefined }}
                  onPointerEnter={() => setHover(r.id)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => onSelect?.(r.id)}
                >
                  <rect x={-labelW} y={cy - rowH / 2} width={width} height={rowH} fill={isActive ? "var(--bg-2)" : "transparent"} />
                  <text x={-12} y={cy} dy="0.32em" textAnchor="end" className="label-strong">
                    {r.label}
                  </text>
                  <line x1={x(r.a)} x2={x(r.b)} y1={cy} y2={cy} stroke="var(--rule-strong)" strokeWidth={2} />
                  <circle cx={x(r.b)} cy={cy} r={4.5} fill="var(--bg)" stroke="var(--reference)" strokeWidth={2} />
                  <circle cx={x(r.a)} cy={cy} r={5} fill="var(--series-1)" stroke="var(--bg)" strokeWidth={1.5} />
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <div className="figure__readout" aria-live="polite">
        {active
          ? (() => {
              const r = rows.find((q) => q.id === active);
              if (!r) return null;
              return (
                <>
                  <span>{r.label}</span>
                  <span>
                    {aLabel} <b style={{ color: "var(--fg)", fontWeight: 500 }}>{format(r.a)}</b>
                  </span>
                  <span>
                    {bLabel} <b style={{ color: "var(--fg)", fontWeight: 500 }}>{format(r.b)}</b>
                  </span>
                  {r.note}
                </>
              );
            })()
          : null}
      </div>
    </div>
  );
}
