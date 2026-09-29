"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { type ReactNode, useMemo, useState } from "react";

import { ReadHint } from "./ReadHint";
import { textWidth } from "./axes";
import { useWidth } from "./useWidth";

export type ScatterLine = { id: string; label: string; x: number[]; y: number[]; color: string; width?: number; dash?: string };

type Props = {
  x: number[];
  y: number[];
  lines?: ScatterLine[];
  format: (v: number) => string;
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  /** Readout for a selected point. */
  readout: (i: number) => ReactNode;
  height?: number;
  /** Compact preview: no readout line, no interaction. */
  preview?: boolean;
};

/**
 * Dense scatter plot. Points are drawn as one path with low opacity, so
 * overlapping points read as density instead of a solid blob. Tapping or
 * hovering selects the nearest point (in screen distance); arrow keys step
 * through the points in order of the x value.
 */
export function Scatter({ x, y, lines = [], format, xLabel, yLabel, ariaLabel, readout, height = 360, preview = false }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const n = x.length;

  const nice = (vals: number[]): [number, number] => {
    let [lo, hi] = extent(vals) as [number | undefined, number | undefined];
    if (lo === undefined || hi === undefined) [lo, hi] = [-0.01, 0.01];
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const d = scaleLinear().domain([lo, hi]).nice(6).domain();
    return [d[0], d[1]];
  };
  const xDom = useMemo(() => nice(x), [x]);
  const yDom = useMemo(() => nice(y), [y]);
  const yTicks = scaleLinear().domain(yDom).ticks(preview ? 4 : 6);
  const margin = {
    top: 8,
    right: 12,
    bottom: preview ? 22 : 40,
    left: Math.max(...yTicks.map((t) => textWidth(format(t)))) + (preview ? 10 : 30),
  };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const xs = useMemo(() => scaleLinear().domain(xDom).range([0, innerW]), [xDom, innerW]);
  const ys = useMemo(() => scaleLinear().domain(yDom).range([innerH, 0]), [yDom, innerH]);
  const xTicks = xs.ticks(Math.max(2, Math.min(8, Math.floor(innerW / 70))));

  const r = n > 2500 ? 1.4 : n > 800 ? 1.8 : 2.4;
  const opacity = n > 2500 ? 0.22 : n > 800 ? 0.3 : 0.45;
  const dots = useMemo(() => {
    let d = "";
    for (let i = 0; i < n; i++) {
      const cx = xs(x[i]);
      const cy = ys(y[i]);
      d += `M${(cx - r).toFixed(1)},${cy.toFixed(1)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    }
    return d;
  }, [x, y, n, xs, ys, r]);
  const paths = useMemo(
    () =>
      lines.map((l) =>
        line<number>()
          .x((v) => xs(v))
          .y((_, i) => ys(l.y[i]))(l.x) ?? "",
      ),
    [lines, xs, ys],
  );
  const order = useMemo(() => Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]), [x, n]);

  const nearest = (px: number, py: number): number | null => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = xs(x[i]) - px;
      const dy = ys(y[i]) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Only points within about a fingertip of the tap count.
    return best >= 0 && bestD <= 28 * 28 ? best : null;
  };
  const onPointer = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearest(e.clientX - rect.left, e.clientY - rect.top);
    if (i != null || e.type === "pointerdown") setSel(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Escape") return setSel(null);
    const pos = sel == null ? -1 : order.indexOf(sel);
    const step = e.shiftKey ? Math.max(1, Math.round(n / 25)) : 1;
    let next = pos;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "ArrowRight") next = pos < 0 ? Math.floor(n / 2) : Math.min(n - 1, pos + step);
    else next = pos < 0 ? Math.floor(n / 2) : Math.max(0, pos - step);
    setSel(order[next]);
  };

  return (
    <div className="chart" ref={ref}>
      {!preview && (
        <div className="figure__readout" aria-live="polite">
          {sel != null ? readout(sel) : <ReadHint hover="Hover a point or use arrow keys to read it" touch="Tap a point to read it" both="Hover or tap a point, or use arrow keys, to read it" />}
        </div>
      )}
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={preview ? undefined : 0}
          onKeyDown={preview ? undefined : onKey}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {yTicks.map((t) => (
              <g key={t} transform={`translate(0,${ys(t)})`}>
                <line className={t === 0 ? "zero-line" : "grid-line"} x2={innerW} />
                <text x={-8} dy="0.32em" textAnchor="end">
                  {format(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <g key={t}>
                {t === 0 && <line className="zero-line" x1={xs(0)} x2={xs(0)} y2={innerH} />}
                <text x={xs(t)} y={innerH + 16} textAnchor="middle">
                  {format(t)}
                </text>
              </g>
            ))}
            <line className="axis-line" y1={innerH} y2={innerH} x2={innerW} />
            {!preview && (
              <>
                <text x={innerW / 2} y={innerH + 34} textAnchor="middle" className="label-strong">
                  {xLabel}
                </text>
                <text transform={`translate(${-margin.left + 12},${innerH / 2}) rotate(-90)`} textAnchor="middle" className="label-strong">
                  {yLabel}
                </text>
              </>
            )}
            <path d={dots} fill="var(--series-1)" fillOpacity={opacity} stroke="none" />
            {lines.map((l, k) => (
              <path key={l.id} d={paths[k]} fill="none" stroke={l.color} strokeWidth={l.width ?? 2} strokeDasharray={l.dash} strokeLinecap="round" />
            ))}
            {sel != null && (
              <g pointerEvents="none">
                <circle cx={xs(x[sel])} cy={ys(y[sel])} r={6} fill="none" stroke="var(--fg)" strokeWidth={1.5} />
                <circle cx={xs(x[sel])} cy={ys(y[sel])} r={2.5} fill="var(--fg)" />
              </g>
            )}
            {!preview && (
              <rect
                width={innerW}
                height={innerH}
                fill="transparent"
                onPointerDown={onPointer}
                onPointerMove={(e) => e.pointerType === "mouse" && onPointer(e)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setSel(null)}
              />
            )}
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}
