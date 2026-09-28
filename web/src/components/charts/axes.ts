import { utcFormat } from "d3-time-format";

export const TEXT_PX = 7; // approximate width of one 12px tabular digit/character

export function textWidth(s: string): number {
  return s.length * TEXT_PX;
}

export function isoToTime(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const fmtYear = utcFormat("%Y");
const fmtMonthYear = utcFormat("%b %Y");
const fmtMonthDay = utcFormat("%b %-d");

/** Tick label format chosen from the visible span. */
export function timeTickFormat(spanMs: number): (v: number) => string {
  const days = spanMs / 86_400_000;
  if (days > 3 * 365) return (v) => fmtYear(new Date(v));
  if (days > 120) return (v) => fmtMonthYear(new Date(v));
  return (v) => fmtMonthDay(new Date(v));
}

export const fmtDate = utcFormat("%b %-d, %Y");

/** Spread label y positions so they are at least ``gap`` apart, keeping order. */
export function spreadLabels(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed = order.map((o) => o.y);
  for (let k = 1; k < placed.length; k++) placed[k] = Math.max(placed[k], placed[k - 1] + gap);
  const overflow = placed.length ? placed[placed.length - 1] - max : 0;
  if (overflow > 0) for (let k = 0; k < placed.length; k++) placed[k] -= overflow;
  for (let k = placed.length - 2; k >= 0; k--) placed[k] = Math.min(placed[k], placed[k + 1] - gap);
  const out = new Array<number>(ys.length);
  order.forEach((o, k) => (out[o.i] = Math.max(min, placed[k])));
  return out;
}

/** Tick positions in trading days: quarters for horizons up to a year, then whole years. */
export function horizonTicks(horizon: number): number[] {
  const step = horizon <= 252 ? 63 : 252;
  const out: number[] = [];
  for (let d = 0; d <= horizon; d += step) out.push(d);
  return out;
}

export function horizonLabel(d: number): string {
  if (d === 0) return "Today";
  if (d % 252 === 0) return d === 252 ? "1 year" : `${d / 252} years`;
  return `${Math.round(d / 21)} mo`;
}
