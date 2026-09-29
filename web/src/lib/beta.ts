/** Nonlinear Beta Tracker: API types and URL state. */

export type Slope = { estimate: number; se: number; se_classical: number; ci_low: number; ci_high: number; p_value: number };

export type BetaBucket = {
  label: string;
  original_label: string;
  quantiles: [number, number];
  n: number;
  benchmark_low: number | null;
  benchmark_high: number | null;
  benchmark_mean: number | null;
  beta: Slope | null;
  sparse: boolean;
};

export type BetaResult = {
  asset: { ticker: string; name?: string; sector?: string; kind?: string };
  benchmark: { ticker: string; name?: string; sector?: string; kind?: string };
  as_of: string;
  observations: number;
  data_quality: {
    start: string;
    end: string;
    observations: number;
    frequency: Frequency;
    return_type: ReturnType;
    lookback: Lookback;
    requested_start: string;
    shared_history_start: string;
    limited_by_history: boolean;
    skipped_gaps: number;
    forward_filled: number;
    price_basis: string;
    risk_free: string;
  };
  linear: { alpha: number; beta: Slope; r_squared: number };
  quadratic: {
    alpha: number;
    b1: Slope;
    b2: Slope;
    r_squared: number;
    r_squared_gain: number;
    sensitivity_levels: {
      benchmark_return: number;
      estimate: number;
      ci_low: number;
      ci_high: number;
      within_range: boolean;
      observations_beyond: number;
    }[];
    curve: {
      benchmark_return: number[];
      sensitivity: number[];
      ci_low: number[];
      ci_high: number[];
      fitted_return: number[];
      linear_fitted_return: number[];
    };
  };
  buckets: BetaBucket[];
  volatility_regimes: { median_vol: number | null; window: number; regimes: { label: string; n: number; beta: Slope | null }[] };
  rolling: { window: number; dates: string[]; beta: (number | null)[]; b1: (number | null)[] };
  stability: { label: string; span: string; n: number; beta?: number; b1?: number; b2?: number; b2_p_value?: number }[];
  scatter: { benchmark: number[]; asset: number[]; dates: string[] };
  benchmark_range: { low: number; high: number; std: number };
  winsorized: boolean;
  findings: string[];
  compute_seconds?: number;
};

export type Lookback = "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "max";
export type Frequency = "daily" | "weekly" | "monthly";
export type ReturnType = "log" | "simple";

export const LOOKBACKS: { value: Lookback; label: string }[] = [
  { value: "6M", label: "6 mo" },
  { value: "1Y", label: "1 yr" },
  { value: "3Y", label: "3 yr" },
  { value: "5Y", label: "5 yr" },
  { value: "10Y", label: "10 yr" },
  { value: "max", label: "Max" },
];
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
export const WINDOWS = [30, 60, 120, 252] as const;

/** Broad benchmarks offered first; any ticker in the universe also works. */
export const BENCHMARKS = ["SPY", "QQQ", "IWM", "DIA", "VTI", "EFA", "AGG"] as const;

/** The original tracker's defaults: NVDA against SPY, five years of daily log returns, 60-period rolling window. */
export const BETA_DEFAULTS = { asset: "NVDA", benchmark: "SPY", lookback: "5Y" as Lookback, freq: "daily" as Frequency, ret: "log" as ReturnType, window: 60, winsorize: false };

export type BetaParams = typeof BETA_DEFAULTS;

const TICKER = /^[A-Z][A-Z0-9-]{0,9}$/;

export function cleanTicker(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/[./]/g, "-");
}

/** Read tracker settings from the URL. Unknown or malformed values fall back to the defaults. */
export function readParams(get: (k: string) => string | null): BetaParams {
  const pick = <T extends string>(v: string | null, allowed: readonly { value: T }[], d: T): T =>
    allowed.some((a) => a.value === v) ? (v as T) : d;
  const a = cleanTicker(get("asset"));
  const b = cleanTicker(get("benchmark"));
  const w = Number(get("w"));
  return {
    asset: TICKER.test(a) ? a : BETA_DEFAULTS.asset,
    benchmark: TICKER.test(b) ? b : BETA_DEFAULTS.benchmark,
    lookback: pick(get("lb"), LOOKBACKS, BETA_DEFAULTS.lookback),
    freq: pick(get("freq"), FREQUENCIES, BETA_DEFAULTS.freq),
    ret: pick(get("ret"), [{ value: "log" }, { value: "simple" }] as const, BETA_DEFAULTS.ret),
    window: (WINDOWS as readonly number[]).includes(w) ? w : BETA_DEFAULTS.window,
    winsorize: get("wz") === "1",
  };
}

/** URL query for settings, omitting defaults so shared links stay short. */
export function toQuery(p: BetaParams): string {
  const q = new URLSearchParams();
  if (p.asset !== BETA_DEFAULTS.asset) q.set("asset", p.asset);
  if (p.benchmark !== BETA_DEFAULTS.benchmark) q.set("benchmark", p.benchmark);
  if (p.lookback !== BETA_DEFAULTS.lookback) q.set("lb", p.lookback);
  if (p.freq !== BETA_DEFAULTS.freq) q.set("freq", p.freq);
  if (p.ret !== BETA_DEFAULTS.ret) q.set("ret", p.ret);
  if (p.window !== BETA_DEFAULTS.window) q.set("w", String(p.window));
  if (p.winsorize) q.set("wz", "1");
  return q.toString();
}

/** Engine query for settings (always explicit, so the CDN cache key is stable). */
export function apiParams(p: BetaParams): Record<string, string | number> {
  return {
    asset: p.asset,
    benchmark: p.benchmark,
    lookback: p.lookback,
    freq: p.freq,
    ret: p.ret,
    window: p.window,
    ...(p.winsorize ? { winsorize: "true" } : {}),
  };
}

export const PERIOD: Record<Frequency, string> = { daily: "day", weekly: "week", monthly: "month" };
