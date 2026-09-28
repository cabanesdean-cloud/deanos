import type { ReactNode } from "react";

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

export function SectionSkeleton() {
  return (
    <div className="section" aria-busy="true" aria-label="Loading">
      <div className="section__head">
        <div className="skeleton" style={{ height: 18, width: 120 }} />
        <div className="skeleton" style={{ height: 64, maxWidth: 640 }} />
      </div>
      <Skeleton height={300} />
      <Skeleton height={120} />
    </div>
  );
}
