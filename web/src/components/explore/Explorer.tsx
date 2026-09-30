"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useTabStrip } from "@/components/ui/useTabStrip";
import { apiUrl, useApi } from "@/lib/api";
import { DEFAULT_SPEC, type Holding, parseSpec, toSpec } from "@/lib/portfolio";
import { SECTIONS, type SectionId } from "@/lib/site";
import type { Demo } from "@/lib/types";

import { PortfolioBar } from "./PortfolioBar";
import { CompareSection } from "./sections/Compare";
import { FactorsSection } from "./sections/Factors";
import { OverviewSection } from "./sections/Overview";
import { RegimesSection } from "./sections/Regimes";
import { RiskSection } from "./sections/Risk";
import { SimulationSection } from "./sections/Simulation";
import { StressSection } from "./sections/Stress";
import { VolatilitySection } from "./sections/Volatility";

export type SectionProps = { spec: string; demos: Demo[] };

const RENDER: Record<SectionId, (p: SectionProps) => React.ReactNode> = {
  overview: (p) => <OverviewSection {...p} />,
  risk: (p) => <RiskSection {...p} />,
  volatility: (p) => <VolatilitySection {...p} />,
  simulation: (p) => <SimulationSection {...p} />,
  regimes: (p) => <RegimesSection {...p} />,
  factors: (p) => <FactorsSection {...p} />,
  stress: (p) => <StressSection {...p} />,
  compare: (p) => <CompareSection {...p} />,
};

export function Explorer() {
  const params = useSearchParams();
  const router = useRouter();
  const spec = params.get("p") || DEFAULT_SPEC;
  const holdings = useMemo(() => parseSpec(spec), [spec]);
  const canonical = toSpec(holdings) || DEFAULT_SPEC;
  const sectionParam = params.get("s");
  const section: SectionId = SECTIONS.some((s) => s.id === sectionParam) ? (sectionParam as SectionId) : "overview";
  const tabs = useTabStrip<HTMLElement>(section);
  const editing = params.get("edit") === "1";

  const demosRes = useApi<{ demos: Demo[] }>(apiUrl("demos"));
  const demos = demosRes.data?.demos ?? [];
  // For the "compare" starting point: the first example portfolio that is not this one.
  const compareWith = demos.find((d) => toSpec(parseSpec(d.p)) !== canonical);

  const href = useCallback(
    (next: { p?: string; s?: SectionId; edit?: boolean }) => {
      const q = new URLSearchParams();
      q.set("p", next.p ?? canonical);
      const s = next.s ?? section;
      if (s !== "overview") q.set("s", s);
      if (next.edit) q.set("edit", "1");
      return `/deanos/explore?${q.toString()}`;
    },
    [canonical, section],
  );

  const apply = (h: Holding[]) => router.push(href({ p: toSpec(h) }) as never, { scroll: false });

  return (
    <>
      <h1 className="visually-hidden">Portfolio explorer</h1>
      <PortfolioBar
        holdings={holdings}
        spec={canonical}
        demos={demos}
        editing={editing}
        onApply={apply}
        onEdit={(on) => router.replace(href({ edit: on }) as never, { scroll: false })}
        onDemo={(p) => router.push(href({ p }) as never, { scroll: false })}
      />
      <div className="container explorer">
        <nav ref={tabs} className="section-nav" aria-label="Analysis sections">
          {SECTIONS.map((s) => (
            <Link key={s.id} href={href({ s: s.id }) as never} aria-current={s.id === section ? "page" : undefined} scroll={false}>
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="explorer__main">
        {section === "overview" && (
          <nav className="guided" aria-label="Suggested starting points">
            <span className="guided__label">Start with</span>
            <Link className="chip" href={href({ s: "risk" }) as never} scroll={false}>
              Which holdings drive risk
            </Link>
            <Link className="chip" href={href({ s: "stress" }) as never} scroll={false}>
              A historical crash
            </Link>
            {compareWith && (
              <Link className="chip" href={`/deanos/explore?p=${encodeURIComponent(canonical)}&s=compare&b=${encodeURIComponent(compareWith.p)}` as never} scroll={false}>
                Compare with {compareWith.name}
              </Link>
            )}
          </nav>
        )}
        <div key={`${section}:${canonical}`} style={{ minWidth: 0 }}>
          <ErrorBoundary label={SECTIONS.find((s) => s.id === section)?.label ?? section}>
            {RENDER[section]({ spec: canonical, demos })}
          </ErrorBoundary>
        </div>
        </div>
      </div>
    </>
  );
}
