import type { Metadata } from "next";
import { Suspense } from "react";

import { Explorer } from "@/components/explore/Explorer";
import { SectionSkeleton } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Analyze an example or custom portfolio: risk, volatility, simulation, market regimes, factor exposures, stress tests and comparisons.",
  alternates: { canonical: "/deanos/explore" },
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
