/** Number formatting. Every figure on the site goes through here. */

const nf = (digits: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const cache = new Map<number, Intl.NumberFormat>();
function fixed(value: number, digits: number): string {
  let f = cache.get(digits);
  if (!f) {
    f = nf(digits);
    cache.set(digits, f);
  }
  return f.format(value);
}

const MINUS = "−";

function sign(s: string): string {
  return s.startsWith("-") ? MINUS + s.slice(1) : s;
}

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 0.0734 -> "7.3%". */
export function pct(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return "n/a";
  return sign(fixed(v * 100, digits)) + "%";
}

/** 0.0734 -> "+7.3%". */
export function signedPct(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return "n/a";
  const s = pct(v, digits);
  return v > 0 ? "+" + s : s;
}

/** Positive loss fraction -> "1.2%" (VaR is shown as a loss, no sign). */
export function lossPct(v: number | null | undefined, digits = 2): string {
  return pct(v, digits);
}

export function num(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return "n/a";
  return sign(fixed(v, digits));
}

export function signedNum(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return "n/a";
  return (v > 0 ? "+" : "") + num(v, digits);
}

export function usd(v: number | null | undefined, digits = 0): string {
  if (!isNum(v)) return "n/a";
  const s = "$" + fixed(Math.abs(v), digits);
  return v < 0 ? MINUS + s : s;
}

export function int(v: number | null | undefined): string {
  if (!isNum(v)) return "n/a";
  return fixed(Math.round(v), 0);
}

/** A range with one unit: "7.2% to 11.4%". */
export function range(
  low: number | null | undefined,
  high: number | null | undefined,
  f: (v: number) => string = (v) => pct(v),
): string {
  if (!isNum(low) || !isNum(high)) return "n/a";
  return `${f(low)} to ${f(high)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2020-03-23" -> "Mar 23, 2020". Parsed as a calendar date, no time zone shift. */
export function date(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function years(tradingDays: number): string {
  return num(tradingDays / 252, 1) + " years";
}
