"use client";

import { scaleLinear } from "d3-scale";
import { type ReactNode, useState } from "react";

import { textWidth } from "./axes";
import { useWidth } from "./useWidth";

export type IntervalRow = {
  id: string;
  label: string;
  /** Used instead of label when the label would take more than a third of a narrow chart. */
  shortLabel?: string;
  value: number;
  low?: number;
  high?: number;
  color?: string;
  /** Muted rows (e.g. not statistically distinguishable from zero). */
  muted?: boolean;
  note?: ReactNode;
};

/** Dot-and-whisker rows on a shared axis with a zero line. */
export function IntervalPlot({
  rows,
  format,
  ariaLabel,
  rowHeight = 36,
  domain,
  refValue = 0,
  refLabel,
}: {
  rows: IntervalRow[];
  format: (v: number) => string;
  ariaLabel: string;
  rowHeight?: number;
  domain?: [number, number];
  refValue?: number;
  refLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const labelOf = (r: IntervalRow) => (r.shortLabel && textWidth(r.label) + 12 > width * 0.35 ? r.shortLabel : r.label);
  const labelW = Math.min(Math.max(...rows.map((r) => textWidth(labelOf(r)))) + 12, width * 0.35);
  const valueW = Math.max(...rows.map((r) => textWidth(format(r.value)))) + 12;
  const innerW = Math.max(0, width - labelW - valueW);
  const lo = domain?.[0] ?? Math.min(refValue, ...rows.map((r) => r.low ?? r.value));
  const hi = domain?.[1] ?? Math.max(refValue, ...rows.map((r) => r.high ?? r.value));
  const x = scaleLinear().domain([lo, hi]).nice(4).range([0, innerW]);
  const height = rows.length * rowHeight + 24;
  const ticks = x.ticks(Math.max(2, Math.floor(innerW / 70)));

  return (
    <div className="chart" ref={ref}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${labelW},0)`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === refValue ? "zero-line" : "grid-line"} x1={x(t)} x2={x(t)} y2={rows.length * rowHeight} />
                <text x={x(t)} y={rows.length * rowHeight + 16} textAnchor="middle">
                  {format(t)}
                </text>
              </g>
            ))}
            {!ticks.includes(refValue) && (
              <line className="zero-line" x1={x(refValue)} x2={x(refValue)} y2={rows.length * rowHeight} />
            )}
            {refLabel && (
              <text x={x(refValue) + 4} y={10} className="faint">
                {refLabel}
              </text>
            )}
            {rows.map((r, i) => {
              const cy = i * rowHeight + rowHeight / 2;
              const color = r.muted ? "var(--fg-3)" : (r.color ?? "var(--series-1)");
              const active = hover === r.id;
              return (
                <g
                  key={r.id}
                  onPointerEnter={() => setHover(r.id)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                  opacity={hover && !active ? 0.55 : 1}
                >
                  <rect x={-labelW} y={cy - rowHeight / 2} width={width} height={rowHeight} fill="transparent" />
                  <text x={-12} y={cy} dy="0.32em" textAnchor="end" className={r.muted ? "" : "label-strong"}>
                    {labelOf(r)}
                  </text>
                  {r.low != null && r.high != null && (
                    <line x1={x(r.low)} x2={x(r.high)} y1={cy} y2={cy} stroke={color} strokeWidth={2} strokeLinecap="round" />
                  )}
                  <circle cx={x(r.value)} cy={cy} r={5} fill={color} stroke="var(--bg)" strokeWidth={2} />
                  <text x={innerW + 12} y={cy} dy="0.32em" className="label-strong">
                    {format(r.value)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <div className="figure__readout" aria-live="polite">
        {hover
          ? (() => {
              const r = rows.find((q) => q.id === hover)!;
              return (
                <>
                  <span>
                    {r.label}: <b style={{ color: "var(--fg)", fontWeight: 500 }}>{format(r.value)}</b>
                    {r.low != null && r.high != null && (
                      <>
                        {" "}
                        (95% interval {format(r.low)} to {format(r.high)})
                      </>
                    )}
                  </span>
                  {r.note && <span>{r.note}</span>}
                </>
              );
            })()
          : null}
      </div>
    </div>
  );
}
