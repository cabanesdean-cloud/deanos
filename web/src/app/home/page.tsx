import type { Metadata } from "next";
import Link from "next/link";

import { DeanosPreview, EngineWarmup, ProjectLinks, TrackerPreview } from "@/components/home/HomePreviews";
import { ContactLinks } from "@/components/site/ContactLinks";
import { HOME_URL, PERSON } from "@/lib/site";

// The personal overview. Served at the domain root: next.config rewrites "/"
// (outside the /deanos base path) to this route, and the canonical URL is the root.
export const metadata: Metadata = {
  title: { absolute: "Dean Cabanes: finance and quantitative modeling projects" },
  description: `${PERSON.description} Projects: the Nonlinear Beta Tracker, DeanOS (portfolio risk and modeling), Options Pricing and Transaction ML.`,
  alternates: { canonical: HOME_URL },
  openGraph: {
    type: "profile",
    siteName: "Dean Cabanes",
    url: HOME_URL,
    title: "Dean Cabanes",
    description: PERSON.description,
    images: [{ url: "/home/opengraph-image", width: 1200, height: 630, alt: "Dean Cabanes: projects" }],
  },
  applicationName: "Dean Cabanes",
  appleWebApp: { title: "Dean Cabanes" },
};

export default function PersonalHome() {
  return (
    <div className="container home">
      <EngineWarmup />
      <section className="home-hero">
        <div className="home-hero__intro">
          <h1 className="home-hero__name">Dean Cabanes</h1>
          <p className="home-hero__lede">
            I&apos;m an economics student building tools to explore financial risk, test models and understand their
            limitations. I&apos;m interested in finance, quantitative modeling, data and AI.
          </p>
          <p className="home-hero__sub">
            Below are four working projects. The first thing I built, the Nonlinear Beta Tracker, is still my favorite.
          </p>
          <div className="hero__actions">
            <a className="button button--primary" href="#projects">
              See the projects
            </a>
            <Link className="button" href="/about">
              About me and how I work
            </Link>
          </div>
          <ContactLinks className="home-hero__contact" />
        </div>

        <article className="project-card project-card--featured" aria-labelledby="p-beta">
          <p className="eyebrow">My first project</p>
          <h2 id="p-beta" className="project-card__name">
            <Link href="/beta">Nonlinear Beta Tracker</Link>
          </h2>
          <p className="project-card__question">
            Does a stock react to the market the same way on sharp down days as on sharp up days?
          </p>
          <TrackerPreview />
          <ProjectLinks tool="/beta" toolLabel="Open the tracker" method="/methodology/beta-tracker" />
        </article>
      </section>

      <section id="projects" className="home-projects" aria-labelledby="projects-title">
        <h2 id="projects-title" className="section__eyebrow">
          Selected projects
        </h2>

        <article className="project-card project-card--wide" aria-labelledby="p-deanos">
          <div className="project-card__text">
            <h3 id="p-deanos" className="project-card__name">
              <Link href="/">DeanOS</Link>
              <span className="project-card__tagline">Portfolio Risk &amp; Modeling Engine</span>
            </h3>
            <p className="project-card__question">
              How does a portfolio behave across changing market conditions: how much it swings, what past crashes would
              have done to it, and how wide the range of outcomes is?
            </p>
            <p className="small muted">
              Eight analyses on one example or custom portfolio: performance, Value at Risk with backtests, GARCH
              volatility, simulation, market regimes, factor exposures, stress tests and comparisons.
            </p>
            <ul className="project-card__starts">
              <li>
                <Link href="/explore?s=risk">See which holdings contribute most to risk</Link>
              </li>
              <li>
                <Link href="/explore?s=stress">Explore a historical crash</Link>
              </li>
              <li>
                <Link href="/explore?s=compare&b=QQQ:40,AMZN:12,GOOGL:12,COST:12,V:12,NFLX:12">Compare example portfolios</Link>
              </li>
            </ul>
            <ProjectLinks tool="/explore" toolLabel="Open the portfolio explorer" method="/methodology" methodLabel="How the models work" />
          </div>
          <div className="project-card__visual">
            <DeanosPreview />
          </div>
        </article>

        <div className="home-projects__pair">
          <article className="project-card" aria-labelledby="p-options">
            <h3 id="p-options" className="project-card__name">
              <Link href="/options">Options Pricing</Link>
            </h3>
            <p className="project-card__question">
              How do Black-Scholes, Monte Carlo and binomial trees compare when they price the same option, and when does
              early exercise matter?
            </p>
            <ProjectLinks tool="/options" toolLabel="Open the pricer" method="/methodology/options-black-scholes" />
          </article>
          <article className="project-card" aria-labelledby="p-tx">
            <h3 id="p-tx" className="project-card__name">
              <Link href="/transactions">Transaction ML</Link>
            </h3>
            <p className="project-card__question">
              Can a small, explainable model categorize bank transactions from merchants it has never seen, and how
              should its accuracy be measured?
            </p>
            <ProjectLinks tool="/transactions" toolLabel="Try the categorizer" method="/methodology/transactions-evaluation" />
          </article>
        </div>
      </section>

      <p className="home-note small muted">
        Everything here is educational: the tools describe historical data and model assumptions, and nothing is
        investment advice. <Link href="/about">About the projects and how they were built</Link>.
      </p>
    </div>
  );
}
