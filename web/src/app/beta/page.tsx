import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BetaTracker } from "@/components/beta/BetaTracker";
import { Skeleton } from "@/components/ui/States";
import { BETA_PROJECT, SITE } from "@/lib/site";

const DESCRIPTION =
  "Dean Cabanes's first project: how a stock's or ETF's sensitivity to a benchmark changes with the benchmark's move. A straight-line beta next to a quadratic fit and its slope, plus betas by benchmark-return bucket and volatility regime, from adjusted daily prices.";

export const metadata: Metadata = {
  title: { absolute: `${BETA_PROJECT.name} · Dean Cabanes` },
  description: DESCRIPTION,
  alternates: { canonical: "/beta" },
  openGraph: {
    title: `${BETA_PROJECT.name} · Dean Cabanes`,
    description: DESCRIPTION,
    url: "/beta",
    siteName: "Dean Cabanes",
    images: [{ url: "/beta/opengraph-image", width: 1200, height: 630, alt: "Nonlinear Beta Tracker" }],
  },
};

export default function BetaPage() {
  return (
    <div className="container">
      <header className="page-head page-head--tight">
        <p className="eyebrow">My first project</p>
        <h1>{BETA_PROJECT.name}</h1>
        <p>
          When the market moves 1%, how much does a stock move? And is that the same on a sharp down day as on a sharp
          up day? Pick a stock or ETF and a benchmark to compare a single straight-line beta with a curve that lets the
          sensitivity change.
        </p>
      </header>

      <Suspense fallback={<Skeleton height={420} />}>
        <BetaTracker />
      </Suspense>

      <section className="three-up beta-about" aria-label="About the tracker">
        <div>
          <h2 className="h3">What it measures</h2>
          <p className="muted">
            Beta is the slope of an asset&apos;s returns against a benchmark&apos;s. The tracker fits that slope as a
            straight line and as a curve, and reads the curve&apos;s slope at each size of benchmark move. It also
            estimates a separate beta within slices of the data: the benchmark&apos;s worst and best periods, and calmer
            and more turbulent stretches.
          </p>
        </div>
        <div>
          <h2 className="h3">What it cannot tell you</h2>
          <p className="muted">
            Estimates change with the window, extreme moves are rare, and a few outliers can bend the curve. A better
            in-sample fit is not a better forecast, and association is not causation. Historical sensitivity is not a
            prediction or a recommendation. The <Link href="/methodology/beta-tracker">methodology</Link> covers each of
            these.
          </p>
        </div>
        <div>
          <h2 className="h3">About this project</h2>
          <p className="muted">
            This was the first thing I built, and it is still my favorite. The original was a standalone web app; this
            version keeps its method (the straight line, the quadratic fit and its slope, the six percentile buckets and
            the volatility split) and runs it on the same nightly price data as{" "}
            <Link href="/">DeanOS</Link>. The <Link href="/methodology/beta-tracker">methodology page</Link> lists what
            was kept and what was corrected
            {SITE.githubUrl ? (
              <>
                , and the <a href={`${SITE.githubUrl}/blob/main/engine/deanos_engine/models/beta.py`}>source</a> is
                public
              </>
            ) : null}
            .
          </p>
        </div>
      </section>
      <section className="prose beta-relation">
        <h2 className="h3">How it relates to DeanOS</h2>
        <p className="muted">
          DeanOS&apos;s <Link href="/explore">portfolio overview</Link> reports a whole portfolio&apos;s beta to the S&amp;P
          500, with separate slopes on up and down days, from simple daily returns. The tracker looks at one asset at a
          time against a benchmark you choose, with the curve and buckets described above and log returns by default,
          as in the original. The two use the same price data, so for the same asset and window their straight-line
          betas are close but not identical.
        </p>
      </section>
    </div>
  );
}
