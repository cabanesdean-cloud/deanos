import type { Metadata } from "next";
import Link from "next/link";

import { HeroFan } from "@/components/landing/HeroFan";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

export default function Home() {
  return (
    <div className="container">
      <section className="hero">
        <h1 className="hero__title">DeanOS</h1>
        <p className="hero__subtitle">Portfolio Risk &amp; Modeling Engine</p>
        <p className="hero__lede">
          Explore how a portfolio behaves across changing market conditions: how much it tends to swing, what
          history&apos;s worst stretches would have done to it, and how wide the range of outcomes is. Every number
          comes with the model behind it and the reasons not to trust it too much.
        </p>
        <div className="hero__actions">
          <Link className="button button--primary" href="/explore">
            Explore the demo
          </Link>
          <Link className="button" href="/explore?edit=1">
            Build your own
          </Link>
        </div>
        <p className="hero__not">
          It describes the past and the assumptions of each model. It is not investment advice, and it does not
          predict returns.
        </p>
        <div className="hero-figure">
          <HeroFan />
        </div>
      </section>

      <section className="three-up" aria-label="What you can explore">
        <div>
          <h2 className="h3">How much could it lose?</h2>
          <p className="muted">
            Typical bad days, the worst historical crashes replayed on your holdings, and custom shocks to stocks
            and interest rates.
          </p>
        </div>
        <div>
          <h2 className="h3">How uncertain is the future?</h2>
          <p className="muted">
            Thousands of simulated years built from real market history, volatility forecasts, and the market
            regime the model thinks we are in.
          </p>
        </div>
        <div>
          <h2 className="h3">What is it really exposed to?</h2>
          <p className="muted">
            Factor exposures to the market, size, value, profitability, investment and momentum, and a side-by-side
            comparison with any other portfolio.
          </p>
        </div>
      </section>

      <section className="three-up" aria-label="How it works">
        <div>
          <h2 className="h3">The data</h2>
          <p className="muted">
            Daily prices for S&amp;P 500 stocks and major ETFs since 2000, plus the Fama-French factor library,
            refreshed every weeknight.
          </p>
        </div>
        <div>
          <h2 className="h3">The models</h2>
          <p className="muted">
            GARCH volatility, hidden Markov regimes, filtered historical VaR, block-bootstrap simulation and
            factor regressions, each tested against reference implementations.
          </p>
        </div>
        <div>
          <h2 className="h3">The honesty</h2>
          <p className="muted">
            Every model has a <Link href="/methodology">methodology page</Link> covering its assumptions, where it
            fails, and live validation results.
          </p>
        </div>
      </section>
    </div>
  );
}
