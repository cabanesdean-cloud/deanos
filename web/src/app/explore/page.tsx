import type { Metadata } from "next";
import { Suspense } from "react";

import { Explorer } from "@/components/explore/Explorer";
import { SectionSkeleton } from "@/components/ui/States";
import { OG_IMAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Analyze an example or custom portfolio: risk, volatility, simulation, market regimes, factor exposures, stress tests and comparisons.",
  alternates: { canonical: "/explore" },
  openGraph: { title: "Explore a portfolio · DeanOS", description: "Risk, volatility, simulation, regimes, factor exposures and stress tests for an example or custom portfolio.", url: "/explore", images: [OG_IMAGE] },
};

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: 32 }}>
          <SectionSkeleton />
        </div>
      }
    >
      <Explorer />
    </Suspense>
  );
}
