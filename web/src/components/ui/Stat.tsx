import type { ReactNode } from "react";

/** A labeled figure. ``range`` shows the uncertainty band under the value. */
export function Stat({ label, value, range, title }: { label: string; value: ReactNode; range?: ReactNode; title?: string }) {
  return (
    <div className="stat" title={title}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {range && <div className="stat__range">{range}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}
