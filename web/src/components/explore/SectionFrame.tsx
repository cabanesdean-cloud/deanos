import Link from "next/link";
import type { ReactNode } from "react";

import { Notice } from "@/components/ui/States";
import { date, int } from "@/lib/format";
import type { DataQuality } from "@/lib/types";

/**
 * Every section follows the same order: a plain-English answer, a chart that
 * shows uncertainty, key numbers as ranges, then how it was calculated.
 */
export function SectionFrame({
  title,
  answer,
  headline,
  children,
  method,
  methodLabel,
  quality,
  asOf,
  stale,
}: {
  title: string;
  answer: ReactNode;
  /** Optional compact metrics shown before the answer, which then renders as smaller supporting text. */
  headline?: ReactNode;
  children: ReactNode;
  method: string;
  methodLabel: string;
  quality?: DataQuality;
  asOf?: string;
  stale?: boolean;
}) {
  return (
    <article className={`section${stale ? " is-stale" : ""}`} aria-busy={stale || undefined}>
      <header className="section__head">
        <h2 className="section__eyebrow">{title}</h2>
        {headline}
        <p className={`section__answer${headline ? " section__answer--compact" : ""}`}>{answer}</p>
        {quality && quality.limited_by.length > 0 && (
          <Notice>
            History starts on {date(quality.start)} because {quality.limited_by.join(", ")}{" "}
            {quality.limited_by.length > 1 ? "were" : "was"} not trading earlier. Figures cover{" "}
            {int(quality.trading_days)} trading days.
          </Notice>
        )}
      </header>
      {children}
      <footer className="section__method">
        <Link href={`/methodology/${method}`}>How this is calculated: {methodLabel}</Link>
        {quality && (
          <span>
            Data {date(quality.start)} to {date(quality.end)}, {quality.rebalancing} rebalancing
            {quality.filled_prices > 0 ? `, ${quality.filled_prices} missing prices carried forward` : ""}
          </span>
        )}
        {asOf && <span>Prices as of {date(asOf)}</span>}
      </footer>
    </article>
  );
}

export function Block({ title, children, caption }: { title?: string; children: ReactNode; caption?: ReactNode }) {
  return (
    <section className="section__block">
      {title && <h3>{title}</h3>}
      {children}
      {caption && <p className="figure__caption">{caption}</p>}
    </section>
  );
}
