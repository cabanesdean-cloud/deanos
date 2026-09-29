"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  inputsQuery,
  type OptionInputs,
  OPTION_SECTIONS,
  type OptionSectionId,
  parseInputs,
} from "@/lib/options";

import { InputsPanel } from "./InputsPanel";
import { AmericanSection } from "./sections/American";
import { AsianSection } from "./sections/Asian";
import { GreeksSection } from "./sections/Greeks";
import { ImpliedVolSection } from "./sections/ImpliedVol";
import { MonteCarloSection } from "./sections/MonteCarlo";
import { PriceSection } from "./sections/Price";

/** Section-specific settings kept in the address alongside the inputs. */
const EXTRA_KEYS = ["n", "avg", "mp"] as const;
type ExtraKey = (typeof EXTRA_KEYS)[number];

export type OptionSectionProps = {
  inputs: OptionInputs;
  get: (key: ExtraKey) => string | null;
  set: (key: ExtraKey, value: string | null) => void;
};

const RENDER: Record<OptionSectionId, (p: OptionSectionProps) => React.ReactNode> = {
  price: (p) => <PriceSection {...p} />,
  montecarlo: (p) => <MonteCarloSection {...p} />,
  greeks: (p) => <GreeksSection {...p} />,
  american: (p) => <AmericanSection {...p} />,
  "implied-vol": (p) => <ImpliedVolSection {...p} />,
  asian: (p) => <AsianSection {...p} />,
};

export function OptionsExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const inputs = useMemo(() => parseInputs(new URLSearchParams(params.toString())), [params]);
  const sectionParam = params.get("s");
  const section: OptionSectionId = OPTION_SECTIONS.some((s) => s.id === sectionParam)
    ? (sectionParam as OptionSectionId)
    : "price";
  const [seedNote, setSeedNote] = useState<string | null>(null);

  const href = useCallback(
    (next: { inputs?: OptionInputs; s?: OptionSectionId; extra?: Partial<Record<ExtraKey, string | null>> }) => {
      const q = inputsQuery(next.inputs ?? inputs);
      const s = next.s ?? section;
      if (s !== "price") q.set("s", s);
      for (const key of EXTRA_KEYS) {
        // A typed market price belongs to the inputs it was entered for.
        if (key === "mp" && next.inputs) continue;
        const v = next.extra && key in next.extra ? next.extra[key] : params.get(key);
        if (v) q.set(key, v);
      }
      const qs = q.toString();
      return "/options" + (qs ? "?" + qs : "");
    },
    [inputs, section, params],
  );

  const props: OptionSectionProps = {
    inputs,
    get: (key) => params.get(key),
    set: (key, value) => router.replace(href({ extra: { [key]: value } }) as never, { scroll: false }),
  };
  const canonical = inputsQuery(inputs).toString();

  return (
    <>
      <InputsPanel
        key={canonical}
        inputs={inputs}
        seedNote={seedNote}
        onSeed={setSeedNote}
        onChange={(next) => router.replace(href({ inputs: next }) as never, { scroll: false })}
      />
      <div className="container explorer">
        <nav className="section-nav" aria-label="Pricing sections">
          {OPTION_SECTIONS.map((s) => (
            <Link key={s.id} href={href({ s: s.id }) as never} aria-current={s.id === section ? "page" : undefined} scroll={false}>
              {s.label}
            </Link>
          ))}
        </nav>
        <div key={section + ":" + canonical} style={{ minWidth: 0 }}>
          <ErrorBoundary label={OPTION_SECTIONS.find((s) => s.id === section)?.label ?? section}>
            {RENDER[section](props)}
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}
