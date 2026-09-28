/** Response shapes from the engine API (only the fields the UI reads). */

export type Nullable<T> = T | null;

export interface HoldingInfo {
  ticker: string;
  weight: number;
  name?: string;
  sector?: string;
  kind?: "stock" | "etf";
}

export interface DataQuality {
  start: string;
  end: string;
  trading_days: number;
  requested_lookback_days: number;
  limited_by: string[];
  filled_prices: number;
  dropped_days: number;
  rebalancing: string;
  price_basis: string;
}

export interface Base {
  as_of: string;
  engine_version: string;
  compute_seconds: number;
  holdings: HoldingInfo[];
  data_quality: DataQuality;
}

export interface Band {
  low: number;
  high: number;
}

export interface Overview extends Base {
  metrics: {
    cagr: number;
    volatility: number;
    sharpe: number;
    sortino: number;
    calmar: number;
    max_drawdown: {
      depth: number;
      peak: Nullable<string>;
      trough: Nullable<string>;
      recovery: Nullable<string>;
      trading_days_to_trough?: number;
      trading_days_to_recover?: Nullable<number>;
    };
    volatility_30d: Nullable<number>;
    volatility_90d: Nullable<number>;
    concentration: { top3_weight: number; herfindahl: number; effective_holdings: number };
    risk_contributions: Record<string, number>;
    beta?: number;
    beta_up?: Nullable<number>;
    beta_down?: Nullable<number>;
    correlations: Record<string, number>;
    intervals: {
      level: Band;
      cagr: Band;
      volatility: Band;
      sharpe: Band;
      max_drawdown: Band;
    };
  };
  growth: { dates: string[]; portfolio: number[]; spy: Nullable<number[]>; drawdown: number[] };
  correlation_matrix: { tickers: string[]; values: number[][] };
}

export type VarMethod = "historical" | "parametric" | "filtered_historical";

export interface BacktestResult {
  days: number;
  breaches: number;
  expected: number;
  breach_rate: number;
  kupiec: { lr: number; p_value: number };
  christoffersen: { lr: number; p_value: number };
  conditional_coverage: { lr: number; p_value: number };
  passes_5pct: boolean;
}

export interface Risk extends Base {
  estimates: Record<"95" | "99", Record<VarMethod, { var: number; es: number }>>;
  volatility_model: "garch" | "ewma";
  contributions_95: Record<string, { var: number; share: Nullable<number> }>;
  backtest: Nullable<{
    start: string;
    end: string;
    estimation_window_days: number;
    garch_window_days: number;
    garch_refit_every_days: number;
    results: Record<VarMethod, Record<"95" | "99", BacktestResult>>;
    series_95: { dates: string[]; returns: number[] } & Record<VarMethod, number[]>;
  }>;
  loss_histogram: { bands_pct: [number, Nullable<number>][]; counts: number[]; down_days: number; total_days: number };
}

export interface Volatility extends Base {
  method: "garch" | "ewma";
  fallback_reason: Nullable<string>;
  current: number;
  percentile_vs_history: number;
  sample_vol: number;
  long_run_model: Nullable<number>;
  forecasts: Record<"average_1d" | "average_5d" | "average_21d" | "average_63d", number>;
  term_structure: { day: number; point: number; average: number }[];
  parameters: {
    omega: number;
    alpha: number;
    beta: number;
    persistence: number;
    half_life_days: Nullable<number>;
  };
  diagnostics: {
    lags?: number;
    residuals?: { stat: number; p_value: number };
    squared_residuals?: { stat: number; p_value: number };
  };
  history: { dates: string[]; realized_21d: number[]; model: number[] };
  holding_volatility: Record<
    string,
    {
      weight: number;
      method: string;
      current: number;
      average_21d: number;
      sample_vol: number;
      ratio_to_sample: Nullable<number>;
      level: Nullable<string>;
      persistence: number;
    }
  >;
}

export interface Probability {
  p: number;
  std_error: number;
}

export interface Simulation extends Base {
  start_value: number;
  horizon_days: number;
  paths: number;
  fan: { days: number[]; p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  final: Record<"p5" | "p10" | "p25" | "p50" | "p75" | "p90" | "p95" | "mean", number>;
  probabilities: Record<"loss" | "loss_10pct" | "loss_20pct" | "gain_25pct", Probability>;
  path_max_drawdown: { p50: number; p95_worst: number };
  histogram: { edges: number[]; counts: number[] };
  assumptions: {
    method: string;
    block_days: number;
    mean_mode: "historical" | "zero";
    sample_start: string;
    sample_end: string;
    sample_years: number;
    sample_mean_daily: number;
    rebalancing: string;
    seed: number;
    notes: string[];
  };
}

export const REGIMES = ["calm", "normal", "volatile", "crisis"] as const;
export type Regime = (typeof REGIMES)[number];

export interface Regimes extends Base {
  model: string;
  converged: boolean;
  current: {
    regime: Regime;
    raw_label: Regime;
    probabilities: Record<Regime, number>;
    days_in_regime: number;
    as_of: string;
  };
  characteristics: Record<
    Regime,
    { annualized_return: Nullable<number>; annualized_vol: Nullable<number>; share_of_days: number }
  >;
  transition_matrix: Record<Regime, Record<Regime, number>>;
  expected_duration_days: Record<Regime, Nullable<number>>;
  history: { dates: string[]; step_days: number; spy_growth?: number[] } & Record<Regime, number[]>;
  stability: {
    starts: {
      seed: number;
      model: string;
      log_likelihood: number;
      agreement: number;
      low_vol_agreement: number;
      current: Regime;
    }[];
    best_seed: number;
    compared_with_best: number;
    agreement_next_best: Nullable<number>;
    low_vol_agreement_next_best: Nullable<number>;
    current_regime_agreement_next_best: Nullable<number>;
  };
  sample: { start: string; end: string };
  method_notes: string[];
  portfolio_by_regime: Record<
    Regime,
    {
      days: number;
      portfolio_return: Nullable<number>;
      portfolio_vol: Nullable<number>;
      spy_return: Nullable<number>;
    }
  >;
  portfolio_window: { start: Nullable<string>; end: Nullable<string> };
}

export const FACTORS = ["Mkt-RF", "SMB", "HML", "RMW", "CMA", "Mom"] as const;
export type Factor = (typeof FACTORS)[number];

export interface Factors extends Base {
  window: { start: string; end: string; trading_days: number; factor_data_end: string };
  loadings: Record<
    Factor,
    {
      description: string;
      beta: number;
      std_error: number;
      t_stat: number;
      p_value: number;
      ci95: [number, number];
      vif: number;
      annual_return_contribution: number;
    }
  >;
  alpha: { annualized: number; ci95: [number, number]; t_stat: number; p_value: number };
  r_squared: number;
  adj_r_squared: number;
  residual_vol: number;
  newey_west_lags: number;
  max_vif: number;
  rolling: { window_days: number; dates: string[] } & Record<Factor, number[]>;
  source: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  start: string;
  end: string;
  trading_days: number;
  portfolio: { return: number; max_drawdown: number; worst_day: number };
  spy: { return: number; max_drawdown: number };
  path: { dates: string[]; portfolio: number[]; spy: number[] };
  holdings: Record<
    string,
    {
      method: "replay" | "beta_scaled" | "market_proxy";
      beta_used: Nullable<number>;
      listed: Nullable<string>;
      return: number;
      max_drawdown: number;
      contribution: number;
    }
  >;
  share_replayed: number;
}

export interface Sensitivity {
  beta_market: number;
  beta_treasury: number;
  r_squared: number;
}

export interface Stress extends Base {
  scenarios: Scenario[];
  worst: Nullable<{ id: string; return: number }>;
  custom: {
    inputs: { market_move: number; rate_change_bps: number };
    portfolio_move: number;
    assumptions: {
      treasury_proxy: string;
      ief_duration_years: number;
      implied_ief_move: number;
      sensitivity_window_days: number;
      notes: string[];
    };
  };
  sensitivities: Record<string, Sensitivity>;
}

export interface CompareSide {
  holdings: Record<string, number>;
  cagr: number;
  volatility: number;
  sharpe: number;
  max_drawdown: number;
  beta: number;
  var95_historical: number;
  es95_historical: number;
  simulation_1y: { p5: number; p50: number; p95: number; probability_of_loss: number };
  stress: Record<string, number>;
}

export interface Compare {
  as_of: string;
  compute_seconds: number;
  window: { start: string; end: string; trading_days: number };
  a: CompareSide;
  b: CompareSide;
  difference: Record<"cagr" | "volatility" | "sharpe" | "max_drawdown" | "beta" | "var95_historical", number>;
  growth: { dates: string[]; a: number[]; b: number[] };
}

export interface UniverseRow {
  ticker: string;
  name?: string;
  sector?: string;
  kind?: "stock" | "etf";
  first_date: string;
}

export interface Universe {
  as_of: string;
  tickers: UniverseRow[];
  factor_data_end: string;
}

export interface Demo {
  id: string;
  name: string;
  description: string;
  holdings: Record<string, number>;
  p: string;
}
