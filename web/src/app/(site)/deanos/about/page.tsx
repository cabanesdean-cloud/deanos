import type { Metadata } from "next";
import Link from "next/link";

import { OG_IMAGE, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "About this site · Dean Cabanes" },
  description:
    "How Dean Cabanes built the tools on deancabanes.com: the AI-assisted workflow, what the public DeanOS leaves out of his personal version, and one example of checking a model and changing it.",
  alternates: { canonical: "/deanos/about" },
  openGraph: {
    title: "About this site · Dean Cabanes",
    description: "How the tools were built, and one example of checking a model and changing it.",
    url: "/deanos/about",
    images: [OG_IMAGE],
  },
};

export default function About() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">About this site</p>
        <h1>How it was built</h1>
        <p>
          The tools on this site are projects I built to understand the models I kept reading about. This page covers
          how I work, how the public DeanOS differs from the version I use myself, and one example of finding a problem
          in a model and fixing it. My background is on the <Link href="/">home page</Link>.
        </p>
      </header>
      <div className="prose">
        <h2 id="public-rebuild">A public rebuild of a personal system</h2>
        <p>
          <Link href="/deanos">DeanOS</Link> on this site is a public rebuild of a system I built for my own portfolio.
          The personal version also includes a Telegram-based agent for natural-language questions and live broker
          data; both are left out here for privacy. Rebuilding it in public meant rechecking every model, and some were
          revised along the way, as the example below shows. The other tools (the{" "}
          <Link href="/beta">Nonlinear Beta Tracker</Link>, <Link href="/options">Options Pricing</Link> and the{" "}
          <Link href="/transactions">Transaction ML</Link> side project) run on the same engine and data.
        </p>
        <p>
          None of this is a trading system, and I am not a professional quantitative researcher. The tools describe
          historical data under stated assumptions.
        </p>

        <h2>How I work</h2>
        <p>
          I use AI coding assistants throughout, the same way many engineers now do, and they wrote much of the code.
          The work that mattered was mine to do: deciding what each tool should answer, choosing the models and their
          assumptions, checking results against reference implementations and published formulas, investigating
          anything that did not hold up, and deciding what to change.
        </p>

        <h2 id="judgment">One example: a Value at Risk that was not what it said</h2>
        <p>
          DeanOS began as a personal tool. Its Value at Risk offered three methods, one of them labeled Monte Carlo.
          Rechecking it for the public version showed that the &quot;Monte Carlo&quot; method drew returns from a
          normal distribution with the portfolio&apos;s own mean and volatility, so it was the normal-distribution
          method again with simulation noise added.
        </p>
        <p>
          That mattered because it looked like an independent second opinion, when it made the same assumption the
          normal method makes: that large losses are as rare as a bell curve says. Real daily returns have fatter tails
          and volatility that clusters.
        </p>
        <p>
          It was replaced with filtered historical simulation, which standardizes the portfolio&apos;s own past returns by
          their GARCH volatility and rescales them by the next-day volatility forecast, so it keeps their fat tails and responds to current volatility. To check it, the
          tests confirm it agrees with the normal method when returns really are normal, and every method is backtested
          on past data: the page counts how often losses exceeded the estimate and applies the Kupiec and Christoffersen
          tests, which check whether breaches happen at the promised rate and whether they bunch together.
        </p>
        <p>
          The limits remain: the backtest covers one history, the estimate is for a single day, and the GARCH model has
          assumptions of its own. The <Link href="/deanos/methodology/value-at-risk">Value at Risk methodology</Link> lists them. The
          same review found two other problems (a volatility forecast labeled as an average that was a single day, and a
          regime model whose fixed random seed landed on a clearly worse fit); each methodology page lists what changed
          and why.
        </p>

        <h2>How it is built</h2>
        <ul>
          <li>A Python engine (NumPy, pandas, SciPy, statsmodels, arch, hmmlearn, scikit-learn) behind a FastAPI service.</li>
          <li>A Next.js front end with charts drawn directly in SVG.</li>
          <li>A nightly job that rebuilds the market data snapshot and precomputes the regime model.</li>
          <li>
            An automated test suite, run on every push, that checks the models against exact values, synthetic data
            with known answers and reference implementations
            {SITE.githubUrl ? (
              <>
                {" "}
                (<a href={`${SITE.githubUrl}/tree/main/engine/tests`}>the tests are public</a>)
              </>
            ) : null}
            .
          </li>
        </ul>

        <h2>What it is not</h2>
        <p>
          Nothing here is investment advice or a prediction. The models describe historical data under stated
          assumptions, and every one of them fails in ways the methodology pages describe. The example portfolios are
          illustrations, not recommendations. Portfolios you enter stay in your browser&apos;s address bar and are never
          stored.
        </p>
      </div>
    </div>
  );
}
