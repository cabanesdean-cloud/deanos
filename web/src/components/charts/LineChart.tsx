"use client";

import { bisector, extent } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { area, line } from "d3-shape";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { fmtDate, spreadLabels, textWidth, timeTickFormat } from "./axes";
import { ReadHint } from "./ReadHint";
import { useWidth } from "./useWidth";

export type LineSeries = {
  id: string;
  label: string;
  values: (number | null)[];
  color: string;
  width?: number;
  dash?: string;
  /** Label the line at its right end with its name and last value. */
  endLabel?: boolean;
};

export type Band = { id: string; lower: number[]; upper: number[]; fill: string };

export type Marker = { index: number; value: number; color: string; r?: number; label?: string };

type Props = {
  x: number[];
  xType?: "time" | "linear";
  xFormat?: (v: number) => string;
  series: LineSeries[];
  bands?: Band[];
  markers?: Marker[];
  yFormat: (v: number) => string;
  yDomain?: [number, number];
  includeZero?: boolean;
  /** Horizontal reference lines (e.g. starting value, zero). */
  refLines?: { value: number; label?: string }[];
  height?: number;
  ariaLabel: string;
  /** Custom readout for the hovered index; defaults to x plus each series value. */
  readout?: (i: number) => ReactNode;
  xTicks?: number;
  /** Explicit x tick positions (linear charts), e.g. whole months. */
  xTickValues?: number[];
  yTicks?: number;
  /** Fixed left margin, to align stacked charts that share an x axis. */
  marginLeft?: number;
  /** Fixed right margin, to align stacked charts that share an x axis. */
  marginRight?: number;
};

export function LineChart({
  x,
  xType = "time",
  xFormat,
  series,
  bands = [],
  markers = [],
  yFormat,
  yDomain,
  includeZero = false,
  refLines = [],
  height = 280,
  ariaLabel,
  readout,
  xTicks = 6,
  xTickValues: xTickOverride,
  yTicks = 5,
  marginLeft,
  marginRight,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const yDom = useMemo((): [number, number] => {
    if (yDomain) return yDomain;
    const vals: number[] = [];
    for (const s of series) for (const v of s.values) if (v != null && Number.isFinite(v)) vals.push(v);
    for (const b of bands) vals.push(...b.lower, ...b.upper);
    for (const r of refLines) vals.push(r.value);
    let [lo, hi] = extent(vals) as [number | undefined, number | undefined];
    if (lo === undefined || hi === undefined) [lo, hi] = [0, 1];
    if (includeZero) [lo, hi] = [Math.min(lo, 0), Math.max(hi, 0)];
    if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
    const nice = scaleLinear().domain([lo, hi]).nice(yTicks).domain();
    return [nice[0], nice[1]];
  }, [series, bands, refLines, yDomain, includeZero, yTicks]);

  const ticks = scaleLinear().domain(yDom).ticks(yTicks);
  const hasEnd = series.some((s) => s.endLabel);
  const endLabelWidth = hasEnd
    ? Math.max(
        ...series
          .filter((s) => s.endLabel)
          .map((s) => {
            const last = [...s.values].reverse().find((v) => v != null);
            return textWidth(`${s.label} ${last != null ? yFormat(last) : ""}`);
          }),
      ) + 12
    : 0;
  const margin = {
    top: 8,
    right: Math.min(marginRight ?? (hasEnd ? endLabelWidth : 8), Math.max(8, width * 0.35)),
    bottom: 24,
    left: marginLeft ?? Math.max(...ticks.map((t) => textWidth(yFormat(t)))) + 10,
  };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const yScale = useMemo(() => scaleLinear().domain(yDom).range([innerH, 0]), [yDom, innerH]);

  const timeScale = useMemo(
    () => scaleUtc().domain([new Date(x[0]), new Date(x[x.length - 1])]).range([0, innerW]),
    [x, innerW],
  );
  const linScale = useMemo(() => scaleLinear().domain([x[0], x[x.length - 1]]).range([0, innerW]), [x, innerW]);
  const xPos = useCallback(
    (v: number): number => (xType === "time" ? timeScale(new Date(v)) : linScale(v)),
    [xType, timeScale, linScale],
  );
  const xInvert = (px: number): number => (xType === "time" ? +timeScale.invert(px) : linScale.invert(px));
  const xTickValues: number[] = xTickOverride
    ? xTickOverride
    : xType === "time"
      ? timeScale.ticks(Math.max(2, Math.min(xTicks, Math.floor(innerW / 80)))).map((d) => +d)
      : linScale.ticks(Math.max(2, Math.min(xTicks, Math.floor(innerW / 60))));
  const xFmt = xFormat ?? (xType === "time" ? timeTickFormat(x[x.length - 1] - x[0]) : (v: number) => String(v));

  const paths = useMemo(
    () =>
      series.map((s) => {
        const gen = line<number | null>()
          .defined((v) => v != null && Number.isFinite(v))
          .x((_, i) => xPos(x[i]))
          .y((v) => yScale(v as number));
        return gen(s.values) ?? "";
      }),
    [series, x, xPos, yScale],
  );
  const bandPaths = useMemo(
    () =>
      bands.map((b) => {
        const gen = area<number>()
          .x((_, i) => xPos(x[i]))
          .y0((_, i) => yScale(b.lower[i]))
          .y1((_, i) => yScale(b.upper[i]));
        return gen(b.lower) ?? "";
      }),
    [bands, x, xPos, yScale],
  );

  const bisect = useMemo(() => bisector((d: number) => d).center, []);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const inv = xInvert(e.clientX - rect.left);
    setHover(Math.max(0, Math.min(x.length - 1, bisect(x, inv))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? Math.max(1, Math.round(x.length / 20)) : 1;
    setHover((h) => {
      const cur = h ?? x.length - 1;
      return Math.max(0, Math.min(x.length - 1, cur + (e.key === "ArrowRight" ? step : -step)));
    });
  };

  const endLabels = useMemo(() => {
    const items = series
      .filter((s) => s.endLabel)
      .map((s) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] == null) i--;
        const v = i >= 0 ? (s.values[i] as number) : 0;
        return { s, v, y: yScale(v) };
      });
    const ys = spreadLabels(items.map((it) => it.y), 15, 6, innerH);
    return items.map((it, k) => ({ ...it, ly: ys[k] }));
  }, [series, yScale, innerH]);

  const hi = hover;
  const defaultReadout = (i: number) => (
    <>
      <span>{xType === "time" ? fmtDate(new Date(x[i])) : xFmt(x[i])}</span>
      {series.map((s) => (
        <span key={s.id}>
          {s.label} <b style={{ color: "var(--fg)", fontWeight: 500 }}>{s.values[i] != null ? yFormat(s.values[i] as number) : "n/a"}</b>
        </span>
      ))}
    </>
  );

  return (
    <div className="chart" ref={ref}>
      <div className="figure__readout" aria-live="polite">
        {hi != null ? (
          (readout ?? defaultReadout)(hi)
        ) : (
          <ReadHint />
        )}
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${yScale(t)})`}>
                <line className={t === 0 && includeZero ? "zero-line" : "grid-line"} x2={innerW} />
                <text x={-8} dy="0.32em" textAnchor="end">
                  {yFormat(t)}
                </text>
              </g>
            ))}
            {xTickValues.map((t) => (
              <text key={t} x={xPos(t)} y={innerH + 18} textAnchor="middle">
                {xFmt(t)}
              </text>
            ))}
            <line className="axis-line" y1={innerH} y2={innerH} x2={innerW} />
            {bands.map((b, k) => (
              <path key={b.id} d={bandPaths[k]} fill={b.fill} stroke="none" />
            ))}
            {refLines.map((r) => (
              <g key={r.value}>
                <line className="zero-line" x2={innerW} y1={yScale(r.value)} y2={yScale(r.value)} strokeDasharray="4 3" />
                {r.label && (
                  <text x={innerW - 4} y={yScale(r.value) + 14} textAnchor="end" className="faint">
                    {r.label}
                  </text>
                )}
              </g>
            ))}
            {series.map((s, k) => (
              <path
                key={s.id}
                d={paths[k]}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width ?? 2}
                strokeDasharray={s.dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {markers.map((m, k) => (
              <circle key={k} cx={xPos(x[m.index])} cy={yScale(m.value)} r={m.r ?? 3} fill={m.color} stroke="var(--bg)" strokeWidth={1.5}>
                {m.label && <title>{m.label}</title>}
              </circle>
            ))}
            {endLabels.map(({ s, v, y, ly }) => (
              <g key={s.id}>
                {Math.abs(ly - y) > 2 && (
                  <line x1={innerW + 2} x2={innerW + 6} y1={y} y2={ly} stroke="var(--rule-strong)" />
                )}
                <text x={innerW + 8} y={ly} dy="0.32em">
                  <tspan className="label-strong">{yFormat(v)}</tspan> {s.label}
                </text>
              </g>
            ))}
            {hi != null && (
              <g pointerEvents="none">
                <line className="crosshair" x1={xPos(x[hi])} x2={xPos(x[hi])} y2={innerH} />
                {series.map((s) =>
                  s.values[hi] != null ? (
                    <circle key={s.id} cx={xPos(x[hi])} cy={yScale(s.values[hi] as number)} r={4} fill={s.color} stroke="var(--bg)" strokeWidth={2} />
                  ) : null,
                )}
              </g>
            )}
            <rect
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              // Mouse: the readout follows the cursor. Touch: it stays on the last point read.
              onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
            />
          </g>
        </svg>
      )}
      {width === 0 && <div style={{ height }} />}
    </div>
  );
}
