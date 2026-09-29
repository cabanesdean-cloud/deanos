/** Transaction ML: types for the engine's /transactions endpoints and page state. */

export const TX_SECTIONS = [
  { id: "prediction", label: "Prediction", method: "transactions-model" },
  { id: "samples", label: "Samples & batch", method: "transactions-data" },
  { id: "confusion", label: "Confusion matrix", method: "transactions-evaluation" },
  { id: "classes", label: "Per-class results", method: "transactions-evaluation" },
  { id: "calibration", label: "Calibration", method: "transactions-evaluation" },
  { id: "baselines", label: "Baselines & leakage", method: "transactions-evaluation" },
  { id: "limitations", label: "Limitations", method: "transactions-limitations" },
] as const;

export type TxSectionId = (typeof TX_SECTIONS)[number]["id"];

export const MAX_DESCRIPTION = 200;
export const MAX_BATCH = 25;
export const DEFAULT_DESCRIPTION = "SQ *BLUE HERON COFFEE SAN DIEGO CA";
export const DEFAULT_AMOUNT = -6.75;

export type TxInputs = { d: string; a: number | null };

/** Read the descriptor and amount from the page address; fall back to an example. */
export function parseTxInputs(q: URLSearchParams): TxInputs {
  const raw = q.get("d");
  const d = raw && raw.trim() ? raw.slice(0, MAX_DESCRIPTION) : DEFAULT_DESCRIPTION;
  const aRaw = q.get("a");
  let a: number | null = raw ? null : DEFAULT_AMOUNT;
  if (aRaw !== null && aRaw.trim() !== "") {
    const n = Number(aRaw);
    a = Number.isFinite(n) && Math.abs(n) <= 1_000_000 ? n : null;
  }
  return { d, a };
}

export function txQuery(inputs: TxInputs): URLSearchParams {
  const q = new URLSearchParams();
  if (inputs.d !== DEFAULT_DESCRIPTION || inputs.a !== DEFAULT_AMOUNT) {
    q.set("d", inputs.d);
    if (inputs.a !== null) q.set("a", String(inputs.a));
  }
  return q;
}

/** Engine URL for a batch: repeated d and a parameters. */
export function batchUrl(rows: { d: string; a: number | null }[]): string {
  const q = new URLSearchParams();
  for (const r of rows) q.append("d", r.d);
  if (rows.some((r) => r.a !== null)) for (const r of rows) q.append("a", r.a === null ? "" : String(r.a));
  return "/deanos/api/transactions/batch?" + q.toString();
}

/** One pasted line: "DESCRIPTION, -12.34" (amount optional, after the last comma). */
export function parseLine(line: string): { d: string; a: number | null } | null {
  const s = line.trim();
  if (!s) return null;
  const m = s.match(/^(.*?)[,\t]\s*(-?\$?-?[\d,]*\.?\d+)\s*$/);
  if (m) {
    const n = Number(m[2].replace(/[$,]/g, ""));
    if (Number.isFinite(n) && m[1].trim()) return { d: m[1].trim().slice(0, MAX_DESCRIPTION), a: n };
  }
  return { d: s.slice(0, MAX_DESCRIPTION), a: null };
}

export function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "none";
  const s = "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? "−" + s : "+" + s;
}

export type Category = { id: string; label: string };

export type Feature = {
  feature: string;
  kind: "char" | "word" | "amount";
  text: string;
  display: string;
  contribution: number;
};

export type Ranked = { category: string; label: string; probability: number };

export type Prediction = Ranked & { confidence: "high" | "medium" | "low" };

export type Categorized = {
  input: { normalized: string; amount: number | null };
  prediction: Prediction;
  top: Ranked[];
  probabilities: Record<string, number>;
  explanation: {
    category: string;
    label: string;
    bias: number;
    total: number;
    tokens: { text: string; contribution: number }[];
    amount: number;
    features: Feature[];
    for: Feature[];
    against: Feature[];
  };
  coverage: { known_text_features: number; text_features: number; share: number };
  compute_seconds: number;
  disclaimer: string;
};

export type BriefRow = {
  amount: number | null;
  normalized?: string;
  prediction?: Prediction;
  top?: Ranked[];
  why?: Feature[];
  error?: string;
};

export type BatchResult = { rows: BriefRow[] };

export type Sample = BriefRow & {
  description: string;
  date: string;
  category: string;
  label: string;
  correct: boolean;
};

export type Examples = {
  presets: { description: string; amount: number | null; note: string }[];
  samples: Sample[];
};

export type ClassRow = { category: string; precision: number; recall: number; f1: number; support: number };

export type Report = {
  n: number;
  accuracy: number;
  macro_f1: number;
  weighted_f1: number;
  per_class: ClassRow[];
};

export type Interval = { accuracy: [number, number]; macro_f1: [number, number]; accuracy_gain?: [number, number] };

export type Bin = { lower: number; upper: number; count: number; confidence: number | null; accuracy: number | null };

export type Reliability = { bins: Bin[]; ece: number };

export type Headline = { accuracy: number; macro_f1: number; n: number };

export type Metrics = {
  categories: Category[];
  metrics: {
    model: Report & {
      top3_accuracy: number;
      log_loss: number;
      log_loss_uncalibrated: number;
      confusion: number[][];
      calibration: Reliability;
      calibration_uncalibrated: Reliability;
      coverage: { threshold: number; coverage: number; accuracy: number | null }[];
      interval: Interval;
      by_merchant_kind: { kind: string; rows: number; accuracy: number }[];
      test_merchant_groups: number;
    };
    keyword: Report & { matched_share: number; confusion: number[][]; interval: Interval };
    hybrid: Report & { interval: Interval };
    majority: Report & { category: string };
    no_amount: Headline;
    ablations: (Headline & { features: string; n_features: number })[];
    leakage: { random_split: Headline; merchant_split: Headline; random_test_rows_with_seen_merchant: number };
  };
  dataset: {
    rows: number;
    splits: Record<"train" | "val" | "test", { rows: number; merchants: number; merchant_groups: number; by_category: Record<string, number> }>;
    amount_missing_share: number;
    groups_shared_across_splits: number;
    split_shares: Record<string, number>;
    brands: number;
    categories: number;
  };
  config: {
    model: string;
    char_ngrams: number[];
    min_df_char: number;
    min_df_word: number;
    amount_weight: number;
    amount_edges: number[];
    C: number;
    C_grid: { C: number; val_macro_f1: number; val_log_loss: number }[];
    temperature: number;
    n_features: { char: number; word: number; amount: number; total: number };
    weights_dtype: string;
  };
  top_features: Record<string, { feature: string; kind: string; text: string; display: string; weight: number }[]>;
  keyword_rules: { category: string; pattern: string }[];
};

export const KIND_LABELS: Record<string, string> = {
  brand: "Well-known brands",
  local: "Local businesses",
  p2p: "People (peer-to-peer)",
  payroll: "Employers (payroll)",
  bank: "Bank fees and deposits",
};

export function labelOf(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}
