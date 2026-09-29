/** Site-wide links. Shared with the other deancabanes.com projects later. */

export const SITE = {
  name: "DeanOS",
  tagline: "Portfolio Risk & Modeling Engine",
  owner: "Dean Cabanes",
  origin: "https://deancabanes.com",
  /** Personal homepage. Null until deancabanes.com is live; the name then renders as plain text. */
  homeUrl: null as string | null,
  basePath: "/deanos",
  /** Set once the public repository exists; the nav hides the link until then. */
  githubUrl: "https://github.com/cabanesdean-cloud/deanos" as string | null,
};

export type ProjectId = "deanos" | "options" | "transaction-ml";

export type ProjectLink = {
  id: ProjectId;
  name: string;
  /** One line for the Projects menu. */
  blurb: string;
  /** Null until the project is live; the menu then shows it as coming soon instead of a dead link. */
  href: string | null;
};

/** Portfolio projects shown in the Projects menu. Edit blurbs and links here as projects launch. */
export const PROJECTS: ProjectLink[] = [
  { id: "deanos", name: "DeanOS", blurb: "Portfolio risk and modeling engine", href: "/" },
  { id: "options", name: "Options Pricing", blurb: "Pricing options and comparing the models behind them", href: "/options" },
  { id: "transaction-ml", name: "Transaction ML", blurb: "Categorizing bank transactions with explainable machine learning", href: "/transactions" },
];

export const OPTIONS_PROJECT = {
  name: "Options Pricing",
  tagline: "Monte Carlo Options Pricing Engine",
  href: "/options",
};

export const TX_PROJECT = {
  name: "Transaction ML",
  tagline: "Explainable Transaction Categorization",
  href: "/transactions",
};

/** Which project a path (without the /deanos base path) belongs to; drives the menu's "Current" tag. */
export function projectForPath(pathname: string): ProjectId {
  if (pathname === "/options" || pathname.startsWith("/options/") || pathname.startsWith("/methodology/options-")) return "options";
  if (pathname === "/transactions" || pathname.startsWith("/transactions/") || pathname.startsWith("/methodology/transactions-"))
    return "transaction-ml";
  return "deanos";
}

/** Header brand (name and home link) for each project. */
export function projectBrand(id: ProjectId): { name: string; href: string } {
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
