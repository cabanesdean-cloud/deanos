"use client";

import { Notice, Skeleton } from "@/components/ui/States";
import { apiUrl, type ApiState, useApi } from "@/lib/api";
import { num } from "@/lib/format";
import type { Category, Metrics } from "@/lib/transactions";

export function useMetrics() {
  return useApi<Metrics>(apiUrl("transactions/metrics"));
}

export const SHORT: Record<string, string> = {
  groceries: "Groc.",
  dining: "Dine",
  transport: "Trans.",
  fuel: "Fuel",
  subscriptions: "Subs.",
  shopping: "Shop.",
  utilities: "Util.",
  housing: "Hous.",
  health: "Hlth.",
  travel: "Trav.",
  entertainment: "Ent.",
  income: "Inc.",
  transfers: "Xfer",
  fees: "Fees",
};

export function short(c: Category) {
  return (
    <abbr title={c.label} style={{ textDecoration: "none" }}>
      {SHORT[c.id] ?? c.label}
    </abbr>
  );
}

/** Signed contribution to a logit, e.g. "+1.24" or "−0.31". */
export function signed(v: number): string {
  return (v >= 0 ? "+" : "") + num(v, 2);
}

/** Background for a contribution: blue pushes toward the category, orange away. */
export function shade(v: number, max: number): string {
  const s = Math.min(1, Math.abs(v) / (max || 1));
  const color = v >= 0 ? "var(--series-1)" : "var(--series-2)";
  return `color-mix(in srgb, ${color} ${Math.round(s * 45)}%, transparent)`;
}

/** Horizontal share bar for tables (0..1); decorative, the number sits beside it. */
export function Bar({ value, color = "var(--series-1)" }: { value: number; color?: string }) {
  const w = Math.max(0, Math.min(1, value));
  return (
    <span className="tx-bar" aria-hidden>
      <span style={{ width: `${w * 100}%`, background: color }} />
    </span>
  );
}

export function MetricsLoading({ state }: { state: ApiState<Metrics> & { retry?: () => void } }) {
  if (state.status === "error") return <Notice tone="error">Results could not load: {state.error.message}</Notice>;
  return <Skeleton height={160} />;
}
