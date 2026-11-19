export function price(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: abs >= 10000 });
}

export function money(v: number | null | undefined, currency = ""): string {
  if (v == null) return "—";
  const s = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

export function signed(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${price(v)}`;
}

export function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function volume(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** A unix-seconds time as a date, with the time of day for intraday bars. */
export function barTime(t: number): string {
  const iso = new Date(t * 1000).toISOString();
  return t % 86400 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** The colour token for a change. */
export function tone(v: number | null | undefined): string {
  if (v == null || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-success" : "text-destructive";
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(parsed) && parsed[0]?.message) return parsed.map((p) => p.message).join("; ");
    } catch {
      // not a validation error
    }
    return error.message;
  }
  return "Something went wrong";
}
