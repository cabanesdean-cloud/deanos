import type { Metadata } from "next";
import Link from "next/link";

import { OG_IMAGE, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Why and how Dean Cabanes built DeanOS, a portfolio risk and modeling engine, and what it is not.",
  alternates: { canonical: "/about" },
  openGraph: { title: "About DeanOS", description: "Why and how Dean Cabanes built DeanOS, and what it is not.", url: "/about", images: [OG_IMAGE] },
};

export default function About() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>About DeanOS</h1>
        <p>A portfolio risk and modeling engine built by {SITE.owner}, an economics student.</p>
      </header>
      <div className="prose">
        <h2>Why I built it</h2>
        <p>
          I wanted to understand the risk models I kept reading about: how a GARCH model decides volatility is
          rising, what a hidden Markov model means by a &quot;regime&quot;, why Value at Risk is both everywhere and
          constantly criticized. Reading about them only went so far, so I built them, first as a personal tool and
          then as this public version.
        </p>
        <p>
          DeanOS is not a trading system and I am not a professional quantitative researcher. It is what happens
          when you teach yourself enough to build working models, test them against known results, and keep finding
          out where their assumptions break.
        </p>

        <h2>How it was built</h2>
        <p>
          I used AI coding assistants throughout, the same way many engineers now do. The work that mattered was
          deciding what the tool should answer, choosing the models and their assumptions, checking results against
          reference implementations and published formulas, and deciding what to change when something did not hold
          up.
        </p>
        <p>
          Rebuilding it for the public is a good example. Rechecking each model turned up real problems: one
          &quot;Monte Carlo&quot; VaR was the normal-distribution VaR with noise added, a volatility forecast was
          labeled as an average when it was a single day, and the regime model&apos;s fixed random seed was landing on
          a clearly worse fit. Each page under <Link href="/methodology">Methodology</Link> lists what changed and
          why.
        </p>

        <h2>How it works</h2>
        <ul>
          <li>A Python engine (NumPy, pandas, SciPy, statsmodels, arch, hmmlearn, scikit-learn) behind a FastAPI service.</li>
          <li>A Next.js front end with charts drawn directly in SVG.</li>
          <li>A nightly job that rebuilds the market data snapshot and precomputes the regime model.</li>
          <li>Around 80 automated tests that check the models against exact values and reference implementations.</li>
        </ul>

        <h2>What it is not</h2>
        <p>
          Nothing here is investment advice or a prediction. The models describe historical data under stated
          assumptions, and every one of them fails in ways the methodology pages describe. The example portfolios
          are illustrations, not recommendations. Portfolios you enter stay in your browser&apos;s address bar and
          are never stored.
        </p>
      </div>
    </div>
  );
}
