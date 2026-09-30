import Link from "next/link";
import type { Metadata, Route } from "next";

import { JsonLd } from "@/components/site/JsonLd";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { CONTACT, HOME_URL, PERSON, SITE } from "@/lib/site";

// Dean's résumé as a web page. Every fact here comes from
// Dean_Cabanes_Resume_2026.pdf (served from /public). The phone number is only
// in the PDF, never on a page.

export const metadata: Metadata = {
  title: { absolute: PERSON.name },
  description: PERSON.description,
  alternates: { canonical: HOME_URL },
  openGraph: {
    type: "profile",
    siteName: PERSON.name,
    url: HOME_URL,
    title: PERSON.name,
    description: PERSON.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${PERSON.name}: résumé and projects` }],
  },
};

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${HOME_URL}#person`,
  name: PERSON.name,
  alternateName: PERSON.fullName,
  url: HOME_URL,
  description: PERSON.description,
  email: CONTACT.email ? `mailto:${CONTACT.email}` : undefined,
  address: { "@type": "PostalAddress", addressLocality: "Santa Barbara", addressRegion: "CA", addressCountry: "US" },
  jobTitle: PERSON.jobTitle,
  worksFor: { "@type": "Organization", name: PERSON.employer },
  affiliation: { "@type": "CollegeOrUniversity", name: PERSON.college },
  alumniOf: { "@type": "HighSchool", name: "Mira Costa High School" },
  knowsAbout: ["Python", "Regression", "Monte Carlo simulation", "Risk modeling", "Options pricing"],
  sameAs: [CONTACT.linkedinUrl, CONTACT.githubProfileUrl].filter((u): u is string => Boolean(u)),
};

type Project = { name: string; href: string; path: string; note?: string; stack: string; lines: string };

const PROJECTS: Project[] = [
  {
    name: "Nonlinear Beta Tracker",
    href: "/beta",
    path: "deancabanes.com/beta",
    note: "My first project",
    stack: "Python, FastAPI, React",
    lines:
      "OLS and quadratic regressions with rolling, market-quantile and volatility-regime betas, to see how a stock\u2019s sensitivity to the market changes across market conditions.",
  },
  {
    name: "DeanOS",
    href: "/deanos",
    path: "deancabanes.com/deanos",
    stack: "Python, Next.js",
    lines:
      "A portfolio risk and modeling engine: market regimes, GARCH volatility, Monte Carlo projections, value at risk with backtests, factor regressions and stress tests. The site version is a public rebuild of my personal system.",
  },
  {
    name: "Options Pricing",
    href: "/options",
    path: "deancabanes.com/options",
    stack: "Python",
    lines:
      "European, Asian and barrier options by Monte Carlo with antithetic variance reduction, standard errors and 95% confidence intervals, checked against Black-Scholes and binomial trees.",
  },
  {
    name: "Transaction ML",
    href: "/transactions",
    path: "deancabanes.com/transactions",
    note: "Side project",
    stack: "Python",
    lines: "A small, explainable model that sorts bank-statement lines into spending categories, tested on merchants it has never seen.",
  },
];

export default function ResumeHome() {
  return (
    <>
      <JsonLd data={PERSON_LD} />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main id="main" className="resume container">
        <header className="resume-head">
          <div className="resume-head__top">
            <h1 className="resume-head__name">{PERSON.name}</h1>
            <div className="resume-head__theme">
              <ThemeToggle />
            </div>
          </div>
          <p className="resume-head__summary">{PERSON.summary}</p>
          <ul className="resume-head__contact" aria-label="Contact and links">
            <li>{PERSON.location}</li>
            {CONTACT.email && (
              <li>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
            )}
            {CONTACT.linkedinUrl && (
              <li>
                <a href={CONTACT.linkedinUrl} rel="me noopener">
                  LinkedIn
                </a>
              </li>
            )}
            {CONTACT.githubProfileUrl && (
              <li>
                <a href={CONTACT.githubProfileUrl} rel="me noopener">
                  GitHub
                </a>
              </li>
            )}
            {CONTACT.resumeUrl && (
              <li className="resume-head__pdf">
                <a href={CONTACT.resumeUrl} download>
                  Download résumé (PDF)
                </a>
              </li>
            )}
          </ul>
        </header>

        <section className="resume-section" aria-labelledby="about">
          <h2 id="about">About</h2>
          <p className="resume-prose">
            I&apos;m an economics student at Santa Barbara City College, building Python tools for portfolio risk
            analysis, options pricing and market modeling. I created DeanOS, a quantitative analytics engine with an
            interactive dashboard and an AI agent interface. I&apos;m looking for opportunities in finance and
            quantitative analysis.
          </p>
        </section>

        <section className="resume-section" aria-labelledby="projects">
          <h2 id="projects">Projects</h2>
          <ul className="resume-projects">
            {PROJECTS.map((p) => (
              <li key={p.href} className={p.note === "Side project" ? "resume-project resume-project--side" : "resume-project"}>
                <h3 className="resume-project__name">
                  <Link href={p.href as Route}>{p.name}</Link>
                  {p.note && <span className="resume-tag">{p.note}</span>}
                </h3>
                <p className="resume-project__meta">{p.stack}</p>
                <p className="resume-project__lines">{p.lines}</p>
                <Link className="resume-project__link" href={p.href as Route}>
                  {p.path} <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="resume-section" aria-labelledby="experience">
          <h2 id="experience">Experience</h2>
          <div className="resume-entry">
            <div className="resume-entry__head">
              <h3>Spyder Surfboards</h3>
              <span className="resume-entry__where">Hermosa Beach, CA · 2024 – Present</span>
            </div>
            <div className="resume-role">
              <div className="resume-role__head">
                <h4>Assistant Director of Marketing</h4>
                <span>September 2025 – Present</span>
              </div>
              <ul>
                <li>
                  Manage Instagram and Facebook content end to end, including photography, video, product launches and
                  event promotion; continue supporting the business remotely while attending college.
                </li>
                <li>
                  Generated 250,000+ views and 1,000+ shares, with approximately 200% engagement growth; promoted Nike SB
                  releases that consistently sold out.
                </li>
              </ul>
            </div>
            <div className="resume-role">
              <div className="resume-role__head">
                <h4>Sales Associate</h4>
                <span>May 2024 – Present</span>
              </div>
              <ul>
                <li>Advise customers on surf gear and apparel, process transactions, and maintain inventory and displays.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="resume-section" aria-labelledby="education">
          <h2 id="education">Education</h2>
          <div className="resume-entry">
            <div className="resume-entry__head">
              <h3>Santa Barbara City College</h3>
              <span className="resume-entry__where">Santa Barbara, CA · 2026 – Present</span>
            </div>
            <p className="resume-entry__detail">Economics · Current GPA: 4.0</p>
            <p className="resume-entry__detail muted">Coursework: Calculus, Microeconomics, Statistics, Public Speaking</p>
          </div>
          <div className="resume-entry">
            <div className="resume-entry__head">
              <h3>Mira Costa High School</h3>
              <span className="resume-entry__where">Manhattan Beach, CA · Graduated 2026</span>
            </div>
          </div>
        </section>

        <section className="resume-section" aria-labelledby="leadership">
          <h2 id="leadership">Leadership &amp; volunteering</h2>
          <div className="resume-entry">
            <div className="resume-entry__head">
              <h3>Los Angeles County Junior Lifeguards</h3>
              <span className="resume-entry__where">Participant 2018 – 2023 · Cadet 2024</span>
            </div>
            <p className="resume-entry__detail">Completed 130+ volunteer hours supporting ocean safety and youth programs.</p>
          </div>
          <div className="resume-entry">
            <div className="resume-entry__head">
              <h3>Jimmy Miller Memorial Foundation</h3>
              <span className="resume-entry__where">Surf Instructor · 2023 – 2024</span>
            </div>
            <p className="resume-entry__detail">
              Supported ocean therapy programs and helped participants develop surf skills safely.
            </p>
          </div>
        </section>

        <section className="resume-section" aria-labelledby="skills">
          <h2 id="skills">Skills &amp; interests</h2>
          <dl className="resume-skills">
            <div>
              <dt>Technical</dt>
              <dd>Python, scikit-learn, FastAPI, Next.js, React; regression, Monte Carlo simulation, risk modeling</dd>
            </div>
            <div>
              <dt>Other</dt>
              <dd>AI-assisted development with Claude and OpenClaw; communication, customer service, content creation</dd>
            </div>
            <div>
              <dt>Interests</dt>
              <dd>Surfing, automotive projects, camping, travel, financial markets</dd>
            </div>
          </dl>
        </section>

        <footer className="resume-foot">
          <Link href="/deanos/about">How this site was built</Link>
          {SITE.githubUrl && <a href={SITE.githubUrl}>Source on GitHub</a>}
        </footer>
      </main>
    </>
  );
}
