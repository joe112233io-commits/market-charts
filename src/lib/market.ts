// Pure market logic shared by the server and the chart: bars, intervals,
// indicators, CSV parsing and alert conditions.

export interface Bar {
  /** Unix seconds, UTC. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const ASSET_TYPES = [
  "stock",
  "crypto",
  "forex",
  "futures",
  "index",
  "fund",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stock",
  crypto: "Crypto",
  forex: "Forex",
  futures: "Futures",
  index: "Index",
  fund: "Fund",
};

export const INTERVALS = ["intraday", "1D", "1W", "1M"] as const;
export type Interval = (typeof INTERVALS)[number];

const DAY = 86400;

export function isIntraday(time: number): boolean {
  return time % DAY !== 0;
}

function bucketStart(time: number, interval: Interval): number {
  const d = new Date(time * 1000);
  if (interval === "1D") return Math.floor(time / DAY) * DAY;
  if (interval === "1W") {
    const day = Math.floor(time / DAY) * DAY;
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    return day - dow * DAY;
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

/** Bars in time order, grouped into the interval. "intraday" keeps intraday bars only. */
export function aggregate(bars: Bar[], interval: Interval): Bar[] {
  if (interval === "intraday") return bars.filter((b) => isIntraday(b.time));
  const out: Bar[] = [];
  let current: Bar | null = null;
  for (const b of bars) {
    const start = bucketStart(b.time, interval);
    if (current && current.time === start) {
      current.high = Math.max(current.high, b.high);
      current.low = Math.min(current.low, b.low);
      current.close = b.close;
      current.volume += b.volume;
    } else {
      current = { ...b, time: start };
      out.push(current);
    }
  }
  return out;
}

export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open =
      i === 0 ? (b.open + b.close) / 2 : (out[i - 1]!.open + out[i - 1]!.close) / 2;
    out.push({
      time: b.time,
      open,
      close,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      volume: b.volume,
    });
  }
  return out;
}

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      seed += values[i]!;
      if (i === period - 1) prev = seed / period;
      out.push(prev);
    } else {
      prev = values[i]! * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export function bollinger(values: number[], period: number, mult: number) {
  const mid = sma(values, period);
  const upper: Series = [];
  const lower: Series = [];
  for (let i = 0; i < values.length; i++) {
    const m = mid[i];
    if (m == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j]! - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

/** Volume-weighted average price, restarting each UTC day for intraday bars and running over the shown range otherwise. */
export function vwap(bars: Bar[]): Series {
  const out: Series = [];
  let pv = 0;
  let vol = 0;
  let day = -1;
  for (const b of bars) {
    const d = Math.floor(b.time / DAY);
    if (isIntraday(b.time) && d !== day) {
      pv = 0;
      vol = 0;
    }
    day = d;
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
    out.push(vol > 0 ? pv / vol : typical);
  }
  return out;
}

export function rsi(values: number[], period = 14): Series {
  const out: Series = [null];
  if (values.length === 0) return [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i]! - values[i - 1]!;
    const g = Math.max(diff, 0);
    const l = Math.max(-diff, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        gain /= period;
        loss /= period;
        out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
      } else out.push(null);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) =>
    f[i] != null && s[i] != null ? f[i]! - s[i]! : null,
  );
  const start = line.findIndex((v) => v != null);
  const sig: Series = values.map(() => null);
  if (start >= 0) {
    const tail = ema(line.slice(start) as number[], signal);
    tail.forEach((v, i) => (sig[start + i] = v));
  }
  const hist: Series = line.map((v, i) =>
    v != null && sig[i] != null ? v - sig[i]! : null,
  );
  return { line, signal: sig, hist };
}

// ---------- CSV ----------

export interface CsvResult {
  bars: Bar[];
  errors: { row: number; message: string }[];
}

function parseTime(raw: string): number | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  if (/^\d{9,10}$/.test(s)) return Number(s);
  if (/^\d{12,13}$/.test(s)) return Math.floor(Number(s) / 1000);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const [, y, m, d] = dateOnly.map(Number) as [number, number, number, number];
    const t = Date.UTC(y, m - 1, d);
    const back = new Date(t);
    if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
    return t / 1000;
  }
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return null;
  const iso = s.replace(" ", "T");
  const t = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

/**
 * Parses rows of date (or datetime), open, high, low, close, volume. A header
 * row is optional; its column names pick the order. Row numbers count from 1
 * with the header included, as a spreadsheet shows them.
 */
export function parseBarsCsv(text: string): CsvResult {
  const lines = text.split(/\r?\n/);
  const errors: CsvResult["errors"] = [];
  const byTime = new Map<number, Bar>();
  let order = [0, 1, 2, 3, 4, 5];
  lines.forEach((line, index) => {
    const row = index + 1;
    if (!line.trim()) return;
    const cells = line.split(/[,;\t]/).map((c) => c.trim());
    if (index === 0 && cells.some((c) => /[a-z]/i.test(c) && !/^\d/.test(c))) {
      const names = cells.map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
      const find = (...keys: string[]) =>
        names.findIndex((n) => keys.includes(n));
      const cols = [
        find("date", "datetime", "time", "timestamp"),
        find("open", "o"),
        find("high", "h"),
        find("low", "l"),
        find("close", "c", "adjclose"),
        find("volume", "vol", "v"),
      ];
      if (cols.some((c) => c < 0)) {
        errors.push({
          row,
          message: "Header needs date, open, high, low, close and volume",
        });
      } else order = cols;
      return;
    }
    const pick = (i: number) => cells[order[i]!] ?? "";
    const time = parseTime(pick(0));
    if (time == null) {
      errors.push({ row, message: `Invalid date "${pick(0)}"` });
      return;
    }
    const nums = [1, 2, 3, 4, 5].map((i) => Number(pick(i)));
    if (nums.some((n, i) => !Number.isFinite(n) || pick(i + 1) === "")) {
      errors.push({ row, message: "Open, high, low, close and volume must be numbers" });
      return;
    }
    const [open, high, low, close, volume] = nums as [number, number, number, number, number];
    if ([open, high, low, close, volume].some((n) => n < 0)) {
      errors.push({ row, message: "Values can't be negative" });
      return;
    }
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
      errors.push({ row, message: "High and low don't contain open and close" });
      return;
    }
    byTime.set(time, { time, open, high, low, close, volume });
  });
  const bars = [...byTime.values()].sort((a, b) => a.time - b.time);
  return { bars, errors };
}

// ---------- Alerts ----------

export const ALERT_CONDITIONS = [
  "crossing",
  "crossing_up",
  "crossing_down",
  "greater_than",
  "less_than",
  "entering_channel",
  "exiting_channel",
  "moving_up_pct",
  "moving_down_pct",
] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];
export const ALERT_CONDITION_LABELS: Record<AlertCondition, string> = {
  crossing: "Crossing",
  crossing_up: "Crossing up",
  crossing_down: "Crossing down",
  greater_than: "Greater than",
  less_than: "Less than",
  entering_channel: "Entering channel",
  exiting_channel: "Exiting channel",
  moving_up_pct: "Moving up %",
  moving_down_pct: "Moving down %",
};
export function isChannel(condition: AlertCondition): boolean {
  return condition === "entering_channel" || condition === "exiting_channel";
}

/** Whether a new bar meets the condition, given the previous bar's close (null when there is none). */
export function alertMet(
  condition: AlertCondition,
  value: number,
  value2: number | null,
  prevClose: number | null,
  bar: Bar,
): boolean {
  const lo = Math.min(value, value2 ?? value);
  const hi = Math.max(value, value2 ?? value);
  const inside = (p: number) => p >= lo && p <= hi;
  switch (condition) {
    case "greater_than":
      return bar.close > value;
    case "less_than":
      return bar.close < value;
    case "crossing_up":
      return prevClose != null && prevClose < value && bar.high >= value;
    case "crossing_down":
      return prevClose != null && prevClose > value && bar.low <= value;
    case "crossing":
      return (
        prevClose != null &&
        ((prevClose < value && bar.high >= value) ||
          (prevClose > value && bar.low <= value))
      );
    case "entering_channel":
      return prevClose != null && !inside(prevClose) && inside(bar.close);
    case "exiting_channel":
      return prevClose != null && inside(prevClose) && !inside(bar.close);
    case "moving_up_pct":
      return prevClose != null && prevClose > 0 && ((bar.close - prevClose) / prevClose) * 100 >= value;
    case "moving_down_pct":
      return prevClose != null && prevClose > 0 && ((prevClose - bar.close) / prevClose) * 100 >= value;
  }
}

// ---------- Paper orders ----------

/** The price a working order fills at on this bar, or null when the bar doesn't reach it. */
export function workingFillPrice(
  side: "buy" | "sell",
  type: "limit" | "stop",
  price: number,
  bar: Bar,
): number | null {
  if (type === "limit") {
    if (side === "buy") return bar.low <= price ? Math.min(bar.open, price) : null;
    return bar.high >= price ? Math.max(bar.open, price) : null;
  }
  if (side === "buy") return bar.high >= price ? Math.max(bar.open, price) : null;
  return bar.low <= price ? Math.min(bar.open, price) : null;
}
