"use client";

import { scaleLinear, scaleSqrt } from "d3-scale";
import { useState } from "react";

import { useWidth } from "./useWidth";

export type ReliabilityPoint = { lower: number; upper: number; count: number; confidence: number | null; accuracy: number | null };

export type ReliabilitySeries = { id: string; label: string; color: string; hollow?: boolean; bins: ReliabilityPoint[] };

/**
 * Reliability diagram: mean stated confidence (x) against observed accuracy (y)
 * per confidence bin, with the diagonal as perfect calibration. Dot area is
 * proportional to the number of predictions in the bin.
 */
export function Reliability({
  series,
  format,
  ariaLabel,
}: {
  series: ReliabilitySeries[];
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const m = { top: 12, right: 16, bottom: 40, left: 44 };
  const size = Math.max(0, Math.min(width, 520));
  const inner = Math.max(0, size - m.left - m.right);
  const height = inner + m.top + m.bottom;
  const x = scaleLinear().domain([0, 1]).range([0, inner]);
  const y = scaleLinear().domain([0, 1]).range([inner, 0]);
  const maxCount = Math.max(1, ...series.flatMap((s) => s.bins.map((b) => b.count)));
  const r = scaleSqrt().domain([0, maxCount]).range([0, Math.max(6, inner / 26)]);
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];

  const active = hover
    ? (() => {
        const [sid, bi] = hover.split(":");
        const s = series.find((q) => q.id === sid);
        const b = s?.bins[Number(bi)];
        return s && b ? { s, b } : null;
      })()
    : null;

  return (
    <div className="chart" ref={ref}>
      <div className="legend" style={{ marginBottom: 8 }}>
        {series.map((s) => (
          <span className="legend__item" key={s.id}>
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="5" fill={s.hollow ? "var(--bg)" : s.color} stroke={s.color} strokeWidth={s.hollow ? 1.5 : 0} />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="legend__item">
          <span className="legend__line" style={{ backgroundImage: "linear-gradient(90deg, var(--fg-3) 60%, transparent 0)", backgroundSize: "6px 2px" }} />
          Perfect calibration
        </span>
      </div>
      {size > 0 ? (
        <svg width={size} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${m.left},${m.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={0} x2={inner} y1={y(t)} y2={y(t)} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end">
                  {format(t)}
                </text>
                <text x={x(t)} y={inner + 18} textAnchor="middle">
                  {format(t)}
                </text>
              </g>
            ))}
            <line className="axis-line" x1={0} x2={inner} y1={inner} y2={inner} />
            <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--fg-3)" strokeDasharray="4 4" />
            <text x={inner / 2} y={inner + 36} textAnchor="middle">
              Stated confidence
            </text>
            <text transform={`translate(${-34},${inner / 2}) rotate(-90)`} textAnchor="middle">
              Share actually right
            </text>
            {series.map((s) =>
              s.bins.map((b, i) =>
                b.confidence === null || b.accuracy === null ? null : (
                  <circle
                    key={s.id + i}
                    cx={x(b.confidence)}
                    cy={y(b.accuracy)}
                    r={Math.max(3, r(b.count))}
                    fill={s.hollow ? "transparent" : `color-mix(in srgb, ${s.color} 70%, transparent)`}
                    stroke={s.color}
                    strokeWidth={s.hollow ? 1.5 : 1}
                    opacity={hover && hover !== s.id + ":" + i ? 0.5 : 1}
                    onPointerEnter={() => setHover(s.id + ":" + i)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                  />
                ),
              ),
            )}
          </g>
        </svg>
      ) : (
        <div style={{ height: 320 }} />
      )}
      <div className="figure__readout" aria-live="polite">
        {active && active.b.confidence !== null && active.b.accuracy !== null ? (
          <span>
            {active.s.label}, confidence {format(active.b.lower)} to {format(active.b.upper)}: stated{" "}
            <b>{format(active.b.confidence)}</b>, actually right <b>{format(active.b.accuracy)}</b> of {active.b.count} predictions
          </span>
        ) : null}
      </div>
    </div>
  );
}
