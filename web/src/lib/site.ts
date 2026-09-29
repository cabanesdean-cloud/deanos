/** Site-wide links. Shared with the other deancabanes.com projects later. */

export const SITE = {
  name: "DeanOS",
  tagline: "Portfolio Risk & Modeling Engine",
  owner: "Dean Cabanes",
  origin: "https://deancabanes.com",
  /**
   * Personal overview. It lives at the domain root, outside the /deanos base
   * path (next.config rewrites "/" to the /home route), so links to it are plain
   * anchors, not next/link.
   */
  homeUrl: "/" as string | null,
  basePath: "/deanos",
  /** Set once the public repository exists; the nav hides the link until then. */
  githubUrl: "https://github.com/cabanesdean-cloud/deanos" as string | null,
};

/**
 * Contact details. Only verified values supplied by Dean go here; every slot
 * that is null is hidden everywhere (header intro, About, footer). Never
 * infer an address from the domain or guess a profile URL.
 */
export const CONTACT = {
  email: "cabanesdean@gmail.com" as string | null,
  linkedinUrl: "https://www.linkedin.com/in/dean-cabanes-3504aa367" as string | null,
  /** Path or URL of a résumé PDF Dean has supplied. */
  resumeUrl: null as string | null,
};

export type ContactLink = { id: "email" | "linkedin" | "resume" | "github"; label: string; href: string };

/** Contact and profile links that exist, in display order. */
export function contactLinks(opts: { github?: boolean } = {}): ContactLink[] {
  const out: ContactLink[] = [];
  if (CONTACT.email) out.push({ id: "email", label: "Email", href: `mailto:${CONTACT.email}` });
  if (CONTACT.linkedinUrl) out.push({ id: "linkedin", label: "LinkedIn", href: CONTACT.linkedinUrl });
  if (CONTACT.resumeUrl) out.push({ id: "resume", label: "Résumé", href: CONTACT.resumeUrl });
  if (opts.github && SITE.githubUrl) out.push({ id: "github", label: "GitHub", href: SITE.githubUrl });
  return out;
}

export const PERSON = {
  name: "Dean Cabanes",
  /** Metadata and structured data; the same facts as the homepage introduction. */
  description: "Economics student building tools to explore financial risk, test models and understand their limitations.",
};

/** The canonical personal overview (domain root). */
export const HOME_URL = `${SITE.origin}/`;

export type ProjectId = "beta" | "deanos" | "options" | "transaction-ml";

export type ProjectLink = {
  id: ProjectId;
  name: string;
  /** One line for the Projects menu. */
  blurb: string;
  /** Short restrained label, e.g. "My first project". */
  note?: string;
  /** Null until the project is live; the menu then shows it as coming soon instead of a dead link. */
  href: string | null;
};

/** Portfolio projects shown in the Projects menu. Edit blurbs and links here as projects launch. */
export const PROJECTS: ProjectLink[] = [
  {
    id: "beta",
    name: "Nonlinear Beta Tracker",
    blurb: "How a stock's sensitivity to the market changes with the market's move",
    note: "My first project",
    href: "/beta",
  },
  { id: "deanos", name: "DeanOS", blurb: "Portfolio risk and modeling engine", href: "/" },
  { id: "options", name: "Options Pricing", blurb: "Pricing options and comparing the models behind them", href: "/options" },
  { id: "transaction-ml", name: "Transaction ML", blurb: "Categorizing bank transactions with explainable machine learning", href: "/transactions" },
];

export const OPTIONS_PROJECT = {
  name: "Options Pricing",
  tagline: "Monte Carlo Options Pricing Engine",
  href: "/options",
};

export const BETA_PROJECT = {
  name: "Nonlinear Beta Tracker",
  tagline: "Linear and state-dependent beta against a benchmark",
  href: "/beta",
};

export const TX_PROJECT = {
  name: "Transaction ML",
  tagline: "Explainable Transaction Categorization",
  href: "/transactions",
};

/** Which project a path (without the /deanos base path) belongs to; drives the menu's "Current" tag. */
export function projectForPath(pathname: string): ProjectId | null {
  if (pathname === "/home") return null;
  if (pathname === "/beta" || pathname.startsWith("/beta/") || pathname.startsWith("/methodology/beta-")) return "beta";
  if (pathname === "/about") return null;
  if (pathname === "/options" || pathname.startsWith("/options/") || pathname.startsWith("/methodology/options-")) return "options";
  if (pathname === "/transactions" || pathname.startsWith("/transactions/") || pathname.startsWith("/methodology/transactions-"))
    return "transaction-ml";
  return "deanos";
}

/** Header brand (name and home link) for each project. */
export function projectBrand(id: ProjectId): { name: string; href: string; short?: string } {
  if (id === "beta") return { name: BETA_PROJECT.name, href: BETA_PROJECT.href, short: "Beta Tracker" };
  if (id === "options") return { name: OPTIONS_PROJECT.name, href: OPTIONS_PROJECT.href };
  if (id === "transaction-ml") return { name: TX_PROJECT.name, href: TX_PROJECT.href };
  return { name: SITE.name, href: "/" };
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

/** Canonical site root, with no trailing slash. */
export const SITE_URL = `${SITE.origin}${SITE.basePath}`;

/** Default share image, repeated on pages that set their own openGraph (which replaces the inherited one). */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "DeanOS: Portfolio Risk & Modeling Engine",
};
