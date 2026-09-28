/** Portfolio encoding shared by the URL, the editor and API calls. */

export type Holding = { ticker: string; weight: number };

export const MAX_HOLDINGS = 25;

export function parseSpec(spec: string | null | undefined): Holding[] {
  if (!spec) return [];
  const out: Holding[] = [];
  for (const part of spec.split(",")) {
    const [t, w] = part.split(":");
    const ticker = (t ?? "").trim().toUpperCase();
    const weight = Number(w);
    if (ticker && Number.isFinite(weight) && weight > 0) out.push({ ticker, weight });
  }
  return out;
}

/** Weights are rounded for the URL; the engine normalizes them anyway. */
export function toSpec(holdings: Holding[]): string {
  return holdings
    .filter((h) => h.ticker && h.weight > 0)
    .map((h) => `${h.ticker.toUpperCase()}:${+h.weight.toFixed(2)}`)
    .join(",");
}

export function normalized(holdings: Holding[]): Holding[] {
  const total = holdings.reduce((s, h) => s + (h.weight > 0 ? h.weight : 0), 0);
  if (total <= 0) return holdings.map((h) => ({ ...h, weight: 0 }));
  return holdings.map((h) => ({ ...h, weight: Math.max(0, h.weight) / total }));
}

export const DEFAULT_SPEC = "VTI:35,VEA:15,VWO:5,AGG:25,TIP:5,VNQ:5,GLD:10";
