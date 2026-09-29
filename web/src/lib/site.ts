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

export type ProjectLink = {
  name: string;
  /** One line for the Projects menu. */
  blurb: string;
  /** Null until the project is live; the menu then shows it as coming soon instead of a dead link. */
  href: string | null;
  current?: boolean;
};

/** Portfolio projects shown in the Projects menu. Edit blurbs and links here as projects launch. */
export const PROJECTS: ProjectLink[] = [
  { name: "DeanOS", blurb: "Portfolio risk and modeling engine", href: "/", current: true },
  { name: "Options Pricing", blurb: "Pricing options and comparing the models behind them", href: null },
  { name: "Transaction ML", blurb: "Machine learning on transaction data", href: null },
];

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
