"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useTabStrip } from "@/components/ui/useTabStrip";
import { parseTxInputs, TX_SECTIONS, txQuery, type TxInputs, type TxSectionId } from "@/lib/transactions";

import { TryPanel } from "./TryPanel";
import { BaselinesSection } from "./sections/Baselines";
import { CalibrationSection } from "./sections/Calibration";
import { ClassesSection } from "./sections/Classes";
import { ConfusionSection } from "./sections/Confusion";
import { LimitationsSection } from "./sections/Limitations";
import { PredictionSection } from "./sections/Prediction";
import { SamplesSection } from "./sections/Samples";

export type TxSectionProps = {
  inputs: TxInputs;
  /** Load a descriptor into the box and show its prediction. */
  tryIt: (next: TxInputs) => void;
};

const RENDER: Record<TxSectionId, (p: TxSectionProps) => React.ReactNode> = {
  prediction: (p) => <PredictionSection {...p} />,
  samples: (p) => <SamplesSection {...p} />,
  confusion: () => <ConfusionSection />,
  classes: () => <ClassesSection />,
  calibration: () => <CalibrationSection />,
  baselines: () => <BaselinesSection />,
  limitations: () => <LimitationsSection />,
};

export function TransactionsExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const inputs = useMemo(() => parseTxInputs(new URLSearchParams(params.toString())), [params]);
  const sectionParam = params.get("s");
  const section: TxSectionId = TX_SECTIONS.some((s) => s.id === sectionParam) ? (sectionParam as TxSectionId) : "prediction";
  const tabs = useTabStrip<HTMLElement>(section);

  const href = useCallback(
    (next: { inputs?: TxInputs; s?: TxSectionId }) => {
      const q = txQuery(next.inputs ?? inputs);
      const s = next.s ?? section;
      if (s !== "prediction") q.set("s", s);
      const qs = q.toString();
      return "/transactions" + (qs ? "?" + qs : "");
    },
    [inputs, section],
  );

  const tryIt = (next: TxInputs) => router.replace(href({ inputs: next, s: "prediction" }) as never, { scroll: false });
  const canonical = txQuery(inputs).toString();

  return (
    <>
      <TryPanel key={canonical} inputs={inputs} onSubmit={tryIt} />
      <div className="container explorer">
        <nav ref={tabs} className="section-nav" aria-label="Transaction ML sections">
          {TX_SECTIONS.map((s) => (
            <Link key={s.id} href={href({ s: s.id }) as never} aria-current={s.id === section ? "page" : undefined} scroll={false}>
              {s.label}
            </Link>
          ))}
        </nav>
        <div key={section + ":" + canonical} style={{ minWidth: 0 }}>
          <ErrorBoundary label={TX_SECTIONS.find((s) => s.id === section)?.label ?? section}>
            {RENDER[section]({ inputs, tryIt })}
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}
