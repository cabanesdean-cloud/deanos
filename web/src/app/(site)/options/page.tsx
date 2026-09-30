import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { OptionsExplorer } from "@/components/options/OptionsExplorer";
import { JsonLd } from "@/components/site/JsonLd";
import { SectionSkeleton } from "@/components/ui/States";
import { OPTIONS_PROJECT, SITE } from "@/lib/site";

const DESCRIPTION =
  "Price European, American and Asian options with Black-Scholes-Merton, Monte Carlo simulation and binomial trees, and see where the models agree. Greeks, implied volatility and convergence shown with their uncertainty.";

export const metadata: Metadata = {
  title: OPTIONS_PROJECT.name,
  description: DESCRIPTION,
  alternates: { canonical: "/options" },
  openGraph: {
    title: OPTIONS_PROJECT.name + " · " + OPTIONS_PROJECT.tagline,
    description: DESCRIPTION,
    url: "/options",
  },
};

export default function OptionsPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: OPTIONS_PROJECT.name,
          alternateName: OPTIONS_PROJECT.tagline,
          url: SITE.origin + "/options",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          description: DESCRIPTION,
          author: { "@type": "Person", name: SITE.owner },
        }}
      />
      <div className="container">
        <header className="page-head page-head--tight">
          <h1>{OPTIONS_PROJECT.name}</h1>
          <p>
            Price one option four ways: the Black-Scholes formula, Monte Carlo simulation and a binomial tree, then see
            where they agree, what early exercise is worth, and why simulation is needed when there is no formula.{" "}
            <Link href="/deanos/methodology#options">How the models work</Link>. An educational tool, not investment advice.
          </p>
        </header>
      </div>
      <div id="explorer" className="anchor-target">
      <Suspense
        fallback={
          <div className="container" style={{ paddingTop: 32 }}>
            <SectionSkeleton />
          </div>
        }
      >
        <OptionsExplorer />
      </Suspense>
      </div>
    </>
  );
}
