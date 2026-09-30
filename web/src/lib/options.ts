/** Options pricer: URL state, API types and formatting. */

import { isNum } from "@/lib/format";

export type OptionType = "call" | "put";
export type ExerciseStyle = "european" | "american";

export const OPTION_SECTIONS = [
  { id: "price", label: "Price", method: "options-black-scholes" },
  { id: "montecarlo", label: "Monte Carlo", method: "options-monte-carlo" },
  { id: "greeks", label: "Greeks", method: "options-black-scholes" },
  { id: "american", label: "Early exercise", method: "options-binomial" },
  { id: "implied-vol", label: "Implied volatility", method: "options-implied-vol" },
  { id: "asian", label: "Asian option", method: "options-monte-carlo" },
  { id: "barrier", label: "Barrier option", method: "options-monte-carlo" },
] as const;

export type OptionSectionId = (typeof OPTION_SECTIONS)[number]["id"];

/**
 * Inputs as they appear in the page address. Rates and volatility are in
 * percent (r=4 means 4%) so links stay readable; the API takes decimals.
 */
export type OptionInputs = {
  S: number;
  K: number;
  T: number;
  r: number;
  q: number;
  v: number;
  type: OptionType;
  style: ExerciseStyle;
};

export const DEFAULT_INPUTS: OptionInputs = { S: 100, K: 100, T: 1, r: 4, q: 0, v: 20, type: "call", style: "european" };

/** Slider and field bounds (a subset of what the engine accepts). */
export const LIMITS = {
  S: { min: 0.01, max: 1_000_000 },
  K: { min: 0.01, max: 1_000_000 },
  T: { min: 0.01, max: 10, step: 0.01 },
  r: { min: -2, max: 15, step: 0.25 },
  q: { min: 0, max: 15, step: 0.25 },
  v: { min: 1, max: 200, step: 1 },
} as const;

function clampNum(raw: string | null, fallback: number, lo: number, hi: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function parseInputs(params: URLSearchParams): OptionInputs {
  const d = DEFAULT_INPUTS;
  return {
    S: clampNum(params.get("S"), d.S, LIMITS.S.min, LIMITS.S.max),
    K: clampNum(params.get("K"), d.K, LIMITS.K.min, LIMITS.K.max),
    T: clampNum(params.get("T"), d.T, LIMITS.T.min, LIMITS.T.max),
    r: clampNum(params.get("r"), d.r, LIMITS.r.min, LIMITS.r.max),
    q: clampNum(params.get("q"), d.q, LIMITS.q.min, LIMITS.q.max),
    v: clampNum(params.get("v"), d.v, LIMITS.v.min, LIMITS.v.max),
    type: params.get("type") === "put" ? "put" : "call",
    style: params.get("style") === "american" ? "american" : "european",
  };
}

/** Round for the address bar; avoids float noise like 0.30000000000000004. */
function tidy(n: number): string {
  return String(Number(n.toPrecision(10)));
}

/** Only non-default values go into the address. */
export function inputsQuery(i: OptionInputs): URLSearchParams {
  const q = new URLSearchParams();
  (["S", "K", "T", "r", "q", "v"] as const).forEach((k) => {
    if (i[k] !== DEFAULT_INPUTS[k]) q.set(k, tidy(i[k]));
  });
  if (i.type !== DEFAULT_INPUTS.type) q.set("type", i.type);
  if (i.style !== DEFAULT_INPUTS.style) q.set("style", i.style);
  return q;
}

/** Engine query parameters (decimals). */
export function apiParams(i: OptionInputs): Record<string, string> {
  return {
    s: tidy(i.S),
    k: tidy(i.K),
    t: tidy(i.T),
    r: tidy(i.r / 100),
    q: tidy(i.q / 100),
    sigma: tidy(i.v / 100),
    type: i.type,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Option prices: cents above $1, more digits below. */
export function money(v: number | null | undefined): string {
  if (!isNum(v)) return "n/a";
  const a = Math.abs(v);
  const digits = a >= 1000 ? 0 : a >= 1 || a === 0 ? 2 : a >= 0.01 ? 3 : 4;
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return v < 0 ? "−" + s : s;
}

/** A difference between two prices shown in cents: cents when it is 10 cents or more, so it matches the rounded prices. */
export function moneyDiff(v: number | null | undefined): string {
  if (!isNum(v)) return "n/a";
  if (Math.abs(v) < 0.1) return money(v);
  const s = "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? "−" + s : s;
}

export function signedMoney(v: number | null | undefined): string {
  if (!isNum(v)) return "n/a";
  return (v > 0 ? "+" : "") + money(v);
}

export function yearsLabel(t: number): string {
  const days = Math.round(t * 365);
  if (t < 1 / 12) return days + (days === 1 ? " day" : " days");
  if (t < 1) {
    const m = Math.round(t * 12);
    return Math.abs(t * 12 - m) < 0.05 ? m + (m === 1 ? " month" : " months") : days + " days";
  }
  return (Number.isInteger(t) ? String(t) : t.toFixed(2)) + (t === 1 ? " year" : " years");
}

export function pathsLabel(n: number): string {
  if (n >= 1_000_000) return n / 1_000_000 + "M";
  if (n >= 1000) return Math.round(n / 100) / 10 + "k";
  return String(n);
}

export function describeOption(i: OptionInputs): string {
  return (i.style === "american" ? "American " : "European ") + i.type;
}

// ─── API types ────────────────────────────────────────────────────────────────

export type Greeks = { delta: number; gamma: number; vega: number; theta: number; rho: number };

export type PriceResult = {
  inputs: Record<string, number | string>;
  black_scholes: { price: number; call: number; put: number; parity_gap: number; greeks: Greeks; prob_itm: number };
  intrinsic: number;
  time_value: number;
  binomial: {
    steps: number;
    european: number;
    american: number;
    early_exercise_premium: number;
    convergence: { steps: number[]; european: number[]; american: number[]; black_scholes: number };
  };
  curves: {
    spot: number[];
    payoff: number[];
    european: number[];
    american: number[];
    delta: number[];
    gamma: number[];
    vega: number[];
    theta: number[];
    rho: number[];
  };
  compute_seconds: number;
};

export type Estimate = { price: number; std_error: number; ci95: [number, number]; paths: number };

export type MonteCarloResult = {
  estimate: Estimate;
  plain: Estimate;
  antithetic: Estimate;
  antithetic_control: Estimate;
  variance_reduction: { antithetic: number | null; antithetic_control: number | null };
  black_scholes: number;
  error_vs_black_scholes: number;
  within_ci: boolean;
  convergence: { paths: number[]; plain: number[]; plain_se: number[]; controlled: number[]; controlled_se: number[] };
  seed: number;
  compute_seconds: number;
};

export type AsianResult = {
  estimate: Estimate;
  plain_std_error: number;
  variance_reduction: number | null;
  geometric_closed_form: number;
  european_black_scholes: number;
  averaging_dates: number;
  convergence: { paths: number[]; controlled: number[]; controlled_se: number[] };
  seed: number;
  compute_seconds: number;
};

export type ImpliedVolResult = {
  sigma: number;
  iterations: number;
  steps: { newton: number; bisection: number };
  method: string;
  converged: boolean;
  repriced: number;
  bounds: [number, number];
  curve: { sigma: number[]; price: number[] };
};

export type HistoricalVol = {
  ticker: string;
  name: string | null;
  last_close: number;
  last_date: string;
  realized_vol: { "1m": number | null; "3m": number | null; "1y": number | null };
  as_of: string;
};

export type TextbookRow = {
  id: string;
  model: string;
  label: string;
  expected: number;
  computed: number;
  decimals: number;
  matches: boolean;
};

export type OptionsValidation = {
  source: string;
  textbook: TextbookRow[];
  monte_carlo: {
    inputs: Record<string, number | string>;
    runs: number;
    paths: number;
    coverage: number;
    mean_error: number;
    rmse: number;
    black_scholes: number;
    variance_reduction: { antithetic: number | null; antithetic_control: number | null };
  };
  binomial: { inputs: Record<string, number | string>; black_scholes: number; rows: { steps: number; price: number; error: number }[] };
  implied_vol: { cases: number; skipped_at_bounds: number; max_abs_error: number };
  /** Added with barrier options; optional so an older engine response still renders. */
  barrier?: {
    inputs: Record<string, number>;
    paths: number;
    bridge_steps: number;
    rows: {
      kind: OptionType;
      barrier_type: BarrierType;
      barrier: number;
      closed_form: number;
      bridge: number;
      bridge_std_error: number;
      bridge_within_ci: boolean;
      discrete: Record<string, { monte_carlo: number; std_error: number; bgk: number }>;
      european: number;
    }[];
  };
  ticker_example?: TickerExample | null;
};

export type TickerExample = {
  ticker: string;
  as_of: string;
  vol_window: string;
  inputs: { s: number; k: number; t: number; r: number; q: number; sigma: number; kind: OptionType };
  paths: number;
  seed: number;
  black_scholes: number;
  rows: {
    estimator: "plain" | "antithetic" | "antithetic_control";
    price: number;
    std_error: number;
    ci95: [number, number];
    difference: number;
    difference_pct: number | null;
    z: number | null;
    within_ci: boolean;
  }[];
};

export type BarrierType = "up-and-out" | "up-and-in" | "down-and-out" | "down-and-in";

export type BarrierResult = {
  estimate: Estimate;
  plain_std_error: number;
  variance_reduction: number | null;
  barrier: number;
  barrier_type: BarrierType;
  monitoring_dates: number;
  breached_at_start: boolean;
  hit_share: number;
  continuous_closed_form: number;
  discrete_bgk: number;
  european_black_scholes: number;
  convergence: { paths: number[]; controlled: number[]; controlled_se: number[] };
  seed: number;
  compute_seconds: number;
};
