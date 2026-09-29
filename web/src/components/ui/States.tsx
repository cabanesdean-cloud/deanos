"use client";

import type { ReactNode } from "react";

import { useSlow } from "@/lib/api";

export function Skeleton({ height = 280 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden />;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <div className={`notice${tone === "error" ? " notice--error" : ""}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}

/**
 * Shown under a skeleton only when a request is still pending after a few
 * seconds, which in practice means the engine is starting (a cold start).
 * A warm engine answers before it appears.
 */
export function SlowNote({ loading }: { loading: boolean }) {
  const slow = useSlow(loading);
  return (
    <p className="slow-note" role="status" aria-live="polite">
      {slow ? "Starting the analysis engine. The first request may take a few seconds." : ""}
    </p>
  );
}

export function SectionSkeleton() {
  return (
    <div className="section" aria-busy="true" aria-label="Loading">
      <div className="section__head">
        <div className="skeleton" style={{ height: 18, width: 120 }} />
        <div className="skeleton" style={{ height: 64, maxWidth: 640 }} />
        <SlowNote loading />
      </div>
      <Skeleton height={300} />
      <Skeleton height={120} />
    </div>
  );
}
