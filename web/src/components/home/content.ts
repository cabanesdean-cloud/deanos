/**
 * Homepage content. Every fact comes from Dean_Cabanes_Resume_2026.pdf (served
 * from /public) and the project pages on this site. The phone number is only in
 * the PDF, never on a page.
 */
import { TOOL_HEADERS, type ProjectId } from "@/lib/site";

export type HomeProject = {
  id: ProjectId;
  name: string;
  /** Short name for tight places (skill table). */
  short: string;
  href: string;
  path: string;
  note?: "My first project" | "Side project";
  featured: boolean;
  stack: string[];
  /** One line, for the overview. */
  blurb: string;
  /** The résumé's description, for the projects view and print. */
  description: string;
  methodHref: string;
};

function methodology(id: ProjectId): string {
  return TOOL_HEADERS[id].nav.find((n) => n.label === "Methodology")?.href ?? "/deanos/methodology";
}

export const HOME_PROJECTS: HomeProject[] = [
  {
    id: "beta",
    name: "Nonlinear Beta Tracker",
    short: "Beta Tracker",
    href: "/beta",
    path: "deancabanes.com/beta",
    note: "My first project",
    featured: true,
    stack: ["Python", "FastAPI", "React"],
    blurb: "How a stock\u2019s sensitivity to the market changes with the market\u2019s move.",
    description:
      "OLS and quadratic regressions with rolling, market-quantile and volatility-regime betas, to see how a stock\u2019s sensitivity to the market changes across market conditions.",
    methodHref: methodology("beta"),
  },
  {
    id: "deanos",
    name: "DeanOS",
    short: "DeanOS",
    href: "/deanos",
    path: "deancabanes.com/deanos",
    featured: true,
    stack: ["Python", "Next.js"],
    blurb: "Portfolio risk and modeling engine.",
    description:
      "A portfolio risk and modeling engine: market regimes, GARCH volatility, Monte Carlo projections, value at risk with backtests, factor regressions and stress tests. The site version is a public rebuild of my personal system.",
    methodHref: methodology("deanos"),
  },
  {
    id: "options",
    name: "Options Pricing",
    short: "Options",
    href: "/options",
    path: "deancabanes.com/options",
    featured: true,
    stack: ["Python"],
    blurb: "Pricing European, American, Asian and barrier options and comparing the models.",
    description:
      "European, Asian and barrier options by Monte Carlo with antithetic variance reduction, standard errors and 95% confidence intervals, checked against Black-Scholes and binomial trees.",
    methodHref: methodology("options"),
  },
  {
    id: "transaction-ml",
    name: "Transaction ML",
    short: "Transaction ML",
    href: "/transactions",
    path: "deancabanes.com/transactions",
    note: "Side project",
    featured: false,
    stack: ["Python"],
    blurb: "Categorizing bank transactions with explainable machine learning.",
    description:
      "A small, explainable model that sorts bank-statement lines into spending categories, tested on merchants it has never seen.",
    methodHref: methodology("transaction-ml"),
  },
];

export const ABOUT =
  "I\u2019m an economics student at Santa Barbara City College, building Python tools for portfolio risk analysis, options pricing and market modeling. I created DeanOS, a quantitative analytics engine with an interactive dashboard and an AI agent interface. I\u2019m looking for opportunities in finance and quantitative analysis.";

export type Role = { id: string; title: string; dates: string; current: boolean; figures: string[]; bullets: string[] };

export const WORK = {
  org: "Spyder Surfboards",
  where: "Hermosa Beach, CA",
  dates: "2024 \u2013 Present",
  roles: [
    {
      id: "spyder-marketing",
      title: "Assistant Director of Marketing",
      dates: "September 2025 \u2013 Present",
      current: true,
      figures: ["1.34M total views", "250K+ views on one post", "1,000+ shares", "~200% engagement growth"],
      bullets: [
        "Manage Instagram and Facebook content end to end, including photography, video, product launches and event promotion; continue supporting the business remotely while attending college.",
        "Generated 1.34M total views, including 250K+ on one post, and 1,000+ shares; grew engagement approximately 200% and promoted Nike SB releases that consistently sold out.",
      ],
    },
    {
      id: "spyder-sales",
      title: "Sales Associate",
      dates: "May 2024 \u2013 Present",
      current: true,
      figures: [],
      bullets: ["Advise customers on surf gear and apparel, process transactions, and maintain inventory and displays."],
    },
  ] satisfies Role[],
};

export const LEADERSHIP = [
  {
    org: "Los Angeles County Junior Lifeguards",
    meta: "Participant 2018 \u2013 2023 \u00b7 Cadet 2024",
    figure: "130+ volunteer hours",
    detail: "Completed 130+ volunteer hours supporting ocean safety and youth programs.",
  },
  {
    org: "Jimmy Miller Memorial Foundation",
    meta: "Surf Instructor \u00b7 2023 \u2013 2024",
    figure: null,
    detail: "Supported ocean therapy programs and helped participants develop surf skills safely.",
  },
];

export const EDUCATION = {
  college: {
    name: "Santa Barbara City College",
    where: "Santa Barbara, CA",
    dates: "2026 \u2013 Present",
    program: "Economics",
  },
  school: { name: "Mira Costa High School", where: "Manhattan Beach, CA", dates: "Graduated 2026" },
};

/** Technical skills from the résumé, with the projects on this page that say they use them. */
export const SKILLS_TECH: { group: string; rows: { skill: string; used: ProjectId[] }[] }[] = [
  {
    group: "Languages and frameworks",
    rows: [
      { skill: "Python", used: ["beta", "deanos", "options", "transaction-ml"] },
      { skill: "scikit-learn", used: [] },
      { skill: "FastAPI", used: ["beta"] },
      { skill: "Next.js", used: ["deanos"] },
      { skill: "React", used: ["beta"] },
    ],
  },
  {
    group: "Methods",
    rows: [
      { skill: "Regression", used: ["beta", "deanos"] },
      { skill: "Monte Carlo simulation", used: ["deanos", "options"] },
      { skill: "Risk modeling", used: ["deanos"] },
    ],
  },
];

export const SKILLS_TEXT = {
  technical: "Python, scikit-learn, FastAPI, Next.js, React; regression, Monte Carlo simulation, risk modeling",
  other: "AI-assisted development with Claude and OpenClaw; communication, customer service, content creation",
  interests: "Surfing, automotive projects, camping, travel, financial markets",
};

export const SKILLS_OTHER = ["AI-assisted development with Claude and OpenClaw", "Communication", "Customer service", "Content creation"];
export const INTERESTS = ["Surfing", "Automotive projects", "Camping", "Travel", "Financial markets"];
