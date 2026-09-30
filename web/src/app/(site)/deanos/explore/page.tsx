import type { Metadata } from "next";
import { Suspense } from "react";

import { Explorer } from "@/components/explore/Explorer";
import { SectionSkeleton } from "@/components/ui/States";
import { RebuildNote } from "@/components/site/RebuildNote";
import { OG_IMAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Portfolio explorer",
  description:
    "Analyze an example or custom portfolio: risk, volatility, simulation, market regimes, factor exposures, stress tests and comparisons.",
  alternates: { canonical: "/deanos/explore" },
  openGraph: { title: "Portfolio explorer · DeanOS", description: "Risk, volatility, simulation, regimes, factor exposures and stress tests for an example or custom portfolio.", url: "/deanos/explore", images: [OG_IMAGE] },
};

export default function ExplorePage() {
  return (
    <>
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: 32 }}>
          <SectionSkeleton />
        </div>
      }
    >
      <Explorer />
    </Suspense>
    <div className="container">
      <RebuildNote className="rebuild-note--foot" />
    </div>
    </>
  );
}
