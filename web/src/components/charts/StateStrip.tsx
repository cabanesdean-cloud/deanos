"use client";

import { bisector } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import { useMemo, useState } from "react";

import { fmtDate, timeTickFormat } from "./axes";
import { ReadHint } from "./ReadHint";
import { useWidth } from "./useWidth";

export type StateSeries = { id: string; label: string; values: number[]; color: string };

/**
 * Most likely state over time as one colored strip, with the model's
 * confidence (the highest probability) as a thin line underneath. Filtered
 * HMM probabilities sit near 0 or 1 most of the time, so a 100% stacked area
 * reads as solid blocks; this shows the same information without implying
 * the model is certain. The readout lists every state's probability.
 */
export function StateStrip({
  x,
  states,
  ariaLabel,
  valueFormat,
  marginLeft = 40,
  stripHeight = 28,
  trackHeight = 44,
  cap,
}: {
  x: number[];
  states: StateSeries[];
  ariaLabel: string;
  valueFormat: (v: number) => string;
  marginLeft?: number;
  stripHeight?: number;
  trackHeight?: number;
  /** Highest probability the model reports (drawn as a reference line). */
  cap?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gap = 10;
  const margin = { top: 4, right: 8, bottom: 24, left: marginLeft };
  const height = margin.top + stripHeight + gap + trackHeight + margin.bottom;
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = stripHeight + gap + trackHeight;
  const xs = useMemo(
    () => scaleUtc().domain([new Date(x[0]), new Date(x[x.length - 1])]).range([0, innerW]),
    [x, innerW],
  );
  const trackTop = stripHeight + gap;
  const ys = useMemo(() => scaleLinear().domain([0.25, 1]).range([trackTop + trackHeight, trackTop]), [trackTop, trackHeight]);

  const top = useMemo(() => {
    const idx: number[] = [];
    const max: number[] = [];
    for (let i = 0; i < x.length; i++) {
      let k = 0;
      for (let j = 1; j < states.length; j++) if (states[j].values[i] > states[k].values[i]) k = j;
      idx.push(k);
      max.push(states[k].values[i]);
    }
    return { idx, max };
  }, [x, states]);

  // Consecutive dates with the same most likely state become one rectangle.
  // Each date covers half the gap to its neighbors, so runs meet without seams.
  const runs = useMemo(() => {
    const edge = (i: number) => (i <= 0 ? 0 : i >= x.length ? innerW : (xs(new Date(x[i - 1])) + xs(new Date(x[i]))) / 2);
    const out: { k: number; x0: number; x1: number }[] = [];
    let start = 0;
    for (let i = 1; i <= x.length; i++) {
      if (i === x.length || top.idx[i] !== top.idx[start]) {
        out.push({ k: top.idx[start], x0: edge(start), x1: edge(i) });
        start = i;
      }
    }
    return out;
  }, [x, xs, innerW, top]);

  const confPath = useMemo(
    () =>
      line<number>()
        .x((_, i) => xs(new Date(x[i])))
        .y((v) => ys(v))(top.max) ?? "",
    [x, xs, ys, top],
  );

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

  const hk = hover != null ? top.idx[hover] : null;
  return (
    <div className="chart" ref={ref}>
      <div className="figure__readout" aria-live="polite">
        {hover != null && hk != null ? (
          <>
            <span>{fmtDate(new Date(x[hover]))}</span>
            <span>
              Most likely <b style={{ color: "var(--fg)", fontWeight: 500 }}>{states[hk].label}</b>
            </span>
            {states.map((s) => (
              <span key={s.id}>
                <span className="legend__swatch" style={{ display: "inline-block", background: s.color, marginRight: 4, verticalAlign: "-1px" }} />
                {s.label} <b style={{ color: "var(--fg)", fontWeight: 500 }}>{valueFormat(s.values[hover])}</b>
              </span>
            ))}
          </>
        ) : (
          <ReadHint />
        )}
      </div>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}>
          <g transform={"translate(" + margin.left + "," + margin.top + ")"}>
            {runs.map((r, i) => (
              <rect key={i} x={r.x0} width={Math.max(0.5, r.x1 - r.x0)} height={stripHeight} fill={states[r.k].color} />
            ))}
            <text x={-8} y={stripHeight / 2} dy="0.32em" textAnchor="end">
              State
            </text>
            {[0.5, 1].map((t) => (
              <g key={t}>
                <line className="grid-line" x2={innerW} y1={ys(t)} y2={ys(t)} />
                <text x={-8} y={ys(t)} dy="0.32em" textAnchor="end">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            {cap != null && cap < 1 && <line className="zero-line" x2={innerW} y1={ys(cap)} y2={ys(cap)} strokeDasharray="3 3" />}
            <path d={confPath} fill="none" stroke="var(--fg-2)" strokeWidth={1.25} strokeLinejoin="round" />
            <line className="axis-line" y1={innerH} y2={innerH} x2={innerW} />
            {ticks.map((t) => (
              <text key={+t} x={xs(t)} y={innerH + 18} textAnchor="middle">
                {fmt(+t)}
              </text>
            ))}
            {hover != null && (
              <g pointerEvents="none">
                <line className="crosshair" x1={xs(new Date(x[hover]))} x2={xs(new Date(x[hover]))} y2={innerH} style={{ stroke: "var(--fg)" }} />
                <circle cx={xs(new Date(x[hover]))} cy={ys(top.max[hover])} r={3.5} fill="var(--fg)" stroke="var(--bg)" strokeWidth={1.5} />
              </g>
            )}
            <rect width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)} />
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}
