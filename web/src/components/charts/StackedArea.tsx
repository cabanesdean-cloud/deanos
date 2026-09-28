"use client";

import { bisector } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { area } from "d3-shape";
import { type ReactNode, useMemo, useState } from "react";

import { fmtDate, timeTickFormat } from "./axes";
import { useWidth } from "./useWidth";

export type Layer = { id: string; label: string; values: number[]; color: string };

/** 100% stacked area over time, for probabilities that sum to one. */
export function StackedArea({
  x,
  layers,
  height = 220,
  ariaLabel,
  valueFormat,
  readoutExtra,
  marginLeft = 40,
}: {
  x: number[];
  layers: Layer[];
  height?: number;
  ariaLabel: string;
  valueFormat: (v: number) => string;
  readoutExtra?: (i: number) => ReactNode;
  marginLeft?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 4, right: 8, bottom: 24, left: marginLeft };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const xs = useMemo(
    () => scaleUtc().domain([new Date(x[0]), new Date(x[x.length - 1])]).range([0, innerW]),
    [x, innerW],
  );
  const ys = scaleLinear().domain([0, 1]).range([innerH, 0]);

  const stacks = useMemo(() => {
    const base = new Array(x.length).fill(0);
    return layers.map((l) => {
      const lower = base.slice();
      for (let i = 0; i < x.length; i++) base[i] += l.values[i];
      const upper = base.slice();
      const d =
        area<number>()
          .x((_, i) => xs(new Date(x[i])))
          .y0((_, i) => ys(lower[i]))
          .y1((_, i) => ys(upper[i]))(lower) ?? "";
      return { l, d };
    });
  }, [layers, x, xs, ys]);

  const bisect = bisector((d: number) => d).center;
  const fmt = timeTickFormat(x[x.length - 1] - x[0]);
  const ticks = xs.ticks(Math.max(2, Math.floor(innerW / 80)));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(x.length - 1, bisect(x, +xs.invert(e.clientX - r.left)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? Math.max(1, Math.round(x.length / 20)) : 1;
    setHover((h) => Math.max(0, Math.min(x.length - 1, (h ?? x.length - 1) + (e.key === "ArrowRight" ? step : -step))));
  };

  return (
    <div className="chart" ref={ref}>
      <div className="figure__readout" aria-live="polite">
        {hover != null ? (
          <>
            <span>{fmtDate(new Date(x[hover]))}</span>
            {layers.map((l) => (
              <span key={l.id}>
                {l.label} <b style={{ color: "var(--fg)", fontWeight: 500 }}>{valueFormat(l.values[hover])}</b>
              </span>
            ))}
            {readoutExtra?.(hover)}
          </>
        ) : (
          <span className="faint">Hover or use arrow keys to read values</span>
        )}
      </div>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {stacks.map(({ l, d }) => (
              <path key={l.id} d={d} fill={l.color} stroke={l.color} strokeWidth={0.5} />
            ))}
            {[0, 0.5, 1].map((t) => (
              <text key={t} x={-8} y={ys(t)} dy="0.32em" textAnchor="end">
                {Math.round(t * 100)}%
              </text>
            ))}
            {ticks.map((t) => (
              <text key={+t} x={xs(t)} y={innerH + 18} textAnchor="middle">
                {fmt(+t)}
              </text>
            ))}
            {hover != null && <line className="crosshair" x1={xs(new Date(x[hover]))} x2={xs(new Date(x[hover]))} y2={innerH} style={{ stroke: "var(--fg)" }} />}
            <rect width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}
