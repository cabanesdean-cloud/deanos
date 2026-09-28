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
  githubUrl: null as string | null,
};

export type ProjectLink = { name: string; href: string | null; current?: boolean };

/** Portfolio projects. `href: null` renders as "coming soon" rather than a dead link. */
export const PROJECTS: ProjectLink[] = [
  { name: "DeanOS", href: "/", current: true },
  { name: "Options Pricing", href: null },
  { name: "Transaction ML", href: null },
  { name: "Surf Forecasting", href: null },
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
