/** Site-wide facts and links for deancabanes.com. */

export const SITE = {
  /** DeanOS, the portfolio risk engine at /deanos. */
  name: "DeanOS",
  tagline: "Portfolio Risk & Modeling Engine",
  owner: "Dean Cabanes",
  origin: "https://deancabanes.com",
  /** The résumé homepage (domain root). */
  homeUrl: "/" as string | null,
  /** DeanOS lives under this path; the engine API stays at /deanos/api. */
  basePath: "/deanos",
  /** Public source repository of this site and its engine. */
  githubUrl: "https://github.com/cabanesdean-cloud/deanos" as string | null,
};

/**
 * Contact details. Only values Dean supplied or that appear on his résumé. The
 * phone number is deliberately absent: it is only inside the downloadable PDF.
 */
export const CONTACT = {
  email: "cabanesdean@gmail.com" as string | null,
  linkedinUrl: "https://www.linkedin.com/in/dean-cabanes-3504aa367" as string | null,
  githubProfileUrl: "https://github.com/cabanesdean-cloud" as string | null,
  /** Résumé PDF served from web/public. */
  resumeUrl: "/Dean_Cabanes_Resume_2026.pdf" as string | null,
};

export type ContactLink = { id: "email" | "linkedin" | "resume" | "github"; label: string; href: string };

/** Contact and profile links that exist, in display order. */
export function contactLinks(opts: { github?: boolean; resume?: boolean } = {}): ContactLink[] {
  const out: ContactLink[] = [];
  if (CONTACT.email) out.push({ id: "email", label: "Email", href: `mailto:${CONTACT.email}` });
  if (CONTACT.linkedinUrl) out.push({ id: "linkedin", label: "LinkedIn", href: CONTACT.linkedinUrl });
  if (opts.github !== false && CONTACT.githubProfileUrl) out.push({ id: "github", label: "GitHub", href: CONTACT.githubProfileUrl });
  if (opts.resume !== false && CONTACT.resumeUrl) out.push({ id: "resume", label: "Résumé (PDF)", href: CONTACT.resumeUrl });
  return out;
}

/** Facts from Dean's résumé (Dean_Cabanes_Resume_2026.pdf). Nothing here that is not on it. */
export const PERSON = {
  name: "Dean Cabanes",
  fullName: "Dean Francisco Cabanes",
  location: "Santa Barbara, CA",
  /** One line, from the résumé's About Me. */
  summary: "Economics student at Santa Barbara City College building Python tools for portfolio risk analysis, options pricing and market modeling.",
  description:
    "Economics student at Santa Barbara City College building Python tools for portfolio risk analysis, options pricing and market modeling. Seeking opportunities in finance and quantitative analysis.",
  college: "Santa Barbara City College",
  employer: "Spyder Surfboards",
  jobTitle: "Assistant Director of Marketing",
};

/** The canonical résumé homepage (domain root). */
export const HOME_URL = `${SITE.origin}/`;

export type ProjectId = "beta" | "deanos" | "options" | "transaction-ml";

export type ProjectLink = {
  id: ProjectId;
  name: string;
  blurb: string;
  note?: string;
  href: string;
};

/** Projects, in the order the résumé lists them; Transaction ML is a side project, last. */
export const PROJECTS: ProjectLink[] = [
  { id: "beta", name: "Nonlinear Beta Tracker", blurb: "How a stock's sensitivity to the market changes with the market's move", note: "My first project", href: "/beta" },
  { id: "deanos", name: "DeanOS", blurb: "Portfolio risk and modeling engine", href: "/deanos" },
  { id: "options", name: "Options Pricing", blurb: "Pricing European, American, Asian and barrier options and comparing the models", href: "/options" },
  { id: "transaction-ml", name: "Transaction ML", blurb: "Categorizing bank transactions with explainable machine learning", note: "Side project", href: "/transactions" },
];

export const OPTIONS_PROJECT = { name: "Options Pricing", tagline: "Monte Carlo Options Pricing Engine", href: "/options" };
export const BETA_PROJECT = { name: "Nonlinear Beta Tracker", tagline: "Linear and state-dependent beta against a benchmark", href: "/beta" };
export const TX_PROJECT = { name: "Transaction ML", tagline: "Explainable Transaction Categorization", href: "/transactions" };

/** Which tool a path belongs to; drives the tool header. "site" is the About page. */
export function projectForPath(pathname: string): ProjectId | "site" {
  if (pathname === "/beta" || pathname.startsWith("/beta/") || pathname.startsWith("/deanos/methodology/beta-")) return "beta";
  if (pathname === "/options" || pathname.startsWith("/options/") || pathname.startsWith("/deanos/methodology/options-")) return "options";
  if (pathname === "/transactions" || pathname.startsWith("/transactions/") || pathname.startsWith("/deanos/methodology/transactions-"))
    return "transaction-ml";
  if (pathname === "/deanos/about") return "site";
  return "deanos";
}

export type ToolNav = { href: string; label: string };
export type ToolHeaderConfig = { name: string; short?: string; href: string; nav: ToolNav[] };

/** Each tool's own minimal header: its name, its sections and its methodology. */
export const TOOL_HEADERS: Record<ProjectId | "site", ToolHeaderConfig> = {
  beta: {
    name: BETA_PROJECT.name,
    short: "Beta Tracker",
    href: "/beta",
    nav: [
      { href: "/beta#tracker", label: "Tracker" },
      { href: "/deanos/methodology/beta-tracker", label: "Methodology" },
    ],
  },
  deanos: {
    name: SITE.name,
    href: "/deanos",
    nav: [
      { href: "/deanos/explore", label: "Explore" },
      { href: "/deanos/methodology", label: "Methodology" },
      { href: "/deanos/about", label: "How it was built" },
    ],
  },
  options: {
    name: OPTIONS_PROJECT.name,
    href: "/options",
    nav: [
      { href: "/options#explorer", label: "Pricer" },
      { href: "/deanos/methodology#options", label: "Methodology" },
    ],
  },
  "transaction-ml": {
    name: TX_PROJECT.name,
    href: "/transactions",
    nav: [
      { href: "/transactions#explorer", label: "Categorizer" },
      { href: "/deanos/methodology#transactions", label: "Methodology" },
    ],
  },
  site: { name: "About this site", href: "/deanos/about", nav: [{ href: "/deanos/methodology", label: "Methodology" }] },
};

/** Header brand for a project (kept for pages that link a project's home). */
export function projectBrand(id: ProjectId): { name: string; href: string; short?: string } {
  const h = TOOL_HEADERS[id];
  return { name: h.name, href: h.href, short: h.short };
}

export const SECTIONS = [
  { id: "overview", label: "Overview", method: "performance" },
  { id: "risk", label: "Risk", method: "value-at-risk" },
  { id: "volatility", label: "Volatility", method: "garch" },
  { id: "simulation", label: "Simulation", method: "monte-carlo" },
  { id: "regimes", label: "Regimes", method: "regimes" },
  { id: "factors", label: "Factors", method: "factors" },
  { id: "stress", label: "Stress tests", method: "stress-tests" },
  { id: "compare", label: "Compare", method: "performance" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/** Canonical DeanOS root, with no trailing slash. */
export const SITE_URL = `${SITE.origin}${SITE.basePath}`;

/** DeanOS share image (pages that set their own openGraph repeat it). */
export const OG_IMAGE = {
  url: "/deanos/og-image",
  width: 1200,
  height: 630,
  alt: "DeanOS: Portfolio Risk & Modeling Engine",
};
