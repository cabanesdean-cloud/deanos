"use client";

import { scaleLinear } from "d3-scale";
import { useState } from "react";

import { ReadHint } from "./ReadHint";
import { useWidth } from "./useWidth";

/** Vertical-bar histogram with optional labeled marker lines. */
export function Histogram({
  edges,
  counts,
  format,
  ariaLabel,
  height = 180,
  markers = [],
  colorFor,
}: {
  edges: number[];
  counts: number[];
  format: (v: number) => string;
  ariaLabel: string;
  height?: number;
  markers?: { value: number; label: string }[];
  colorFor?: (lo: number, hi: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 18, right: 8, bottom: 24, left: 8 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const x = scaleLinear().domain([edges[0], edges[edges.length - 1]]).range([0, innerW]);
  const y = scaleLinear().domain([0, Math.max(...counts)]).range([innerH, 0]);
  const total = counts.reduce((a, b) => a + b, 0);
  const ticks = x.ticks(Math.max(2, Math.floor(innerW / 90)));
  // Touch: read the bar under the finger anywhere in the chart, so thin bars need no precise tap.
  const onTouch = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") return;
    const v = x.invert(e.clientX - e.currentTarget.getBoundingClientRect().left - margin.left);
    let i = 0;
    while (i < counts.length - 1 && v >= edges[i + 1]) i++;
    setHover(i);
  };

  return (
    <div className="chart" ref={ref}>
      <div className="figure__readout" aria-live="polite">
        {hover != null ? (
          <span>
            {format(edges[hover])} to {format(edges[hover + 1])}:{" "}
            <b style={{ color: "var(--fg)", fontWeight: 500 }}>{((counts[hover] / total) * 100).toFixed(1)}%</b> of outcomes
          </span>
        ) : (
          <ReadHint hover="Hover a bar to read it" touch="Tap a bar to read it" both="Hover or tap a bar to read it" />
        )}
      </div>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerDown={onTouch}
          onPointerMove={onTouch}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {counts.map((c, i) => {
              const x0 = x(edges[i]);
              const w = Math.max(1, x(edges[i + 1]) - x0 - 2);
              return (
                <rect
                  key={i}
                  x={x0 + 1}
                  y={y(c)}
                  width={w}
                  height={innerH - y(c)}
                  rx={1}
                  fill={colorFor ? colorFor(edges[i], edges[i + 1]) : "var(--series-1)"}
                  opacity={hover == null || hover === i ? 1 : 0.5}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                />
              );
            })}
            <line className="axis-line" y1={innerH} y2={innerH} x2={innerW} />
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={innerH + 18} textAnchor="middle">
                {format(t)}
              </text>
            ))}
            {markers.map((m) => (
              <g key={m.label} pointerEvents="none">
                <line x1={x(m.value)} x2={x(m.value)} y1={-6} y2={innerH} stroke="var(--fg)" strokeDasharray="3 3" />
                <text x={x(m.value) + 4} y={-6} className="label-strong">
                  {m.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}
