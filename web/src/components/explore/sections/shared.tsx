"use client";

import type { ReactNode } from "react";

import { Notice, SectionSkeleton } from "@/components/ui/States";
import { type ApiState, useApi } from "@/lib/api";

/** Render a section's loading and error states; hand ready data to ``children``. */
export function Loaded<T>({
  state,
  title,
  children,
}: {
  state: ApiState<T> & { stale: boolean };
  title: string;
  children: (data: T, stale: boolean) => ReactNode;
}) {
  if (state.status === "loading") return <SectionSkeleton />;
  if (state.status === "error")
    return (
      <article className="section">
        <header className="section__head">
          <h2 className="section__eyebrow">{title}</h2>
        </header>
        <Notice tone="error">
          {state.status === "error" && state.error.status === 400
            ? state.error.message
            : `This section could not load: ${state.error.message}`}
        </Notice>
      </article>
    );
  return <>{children(state.data, state.stale)}</>;
}

export { useApi };

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

/** Inline horizontal bar for a share in a table cell (0..1). */
export function ShareBar({ value, color = "var(--series-1)" }: { value: number; color?: string }) {
  const w = Math.max(0, Math.min(1, value));
  return (
    <span style={{ display: "inline-block", width: 56, height: 8, background: "var(--bg-3)", borderRadius: 2, verticalAlign: "middle", marginLeft: 8 }} aria-hidden>
      <span style={{ display: "block", width: `${w * 100}%`, height: "100%", background: color, borderRadius: 2 }} />
    </span>
  );
}
