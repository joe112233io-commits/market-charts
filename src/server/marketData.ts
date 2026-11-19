import { env } from "cloudflare:workers";
import { db } from "@/db";
import { symbols } from "@/db/schema";
import type { Bar } from "@/lib/market";
import { upsertBars } from "@/server/symbols";

const API = "https://www.alphavantage.co/query";

/** The provider's request for a symbol's daily series. */
function seriesParams(s: { ticker: string; assetType: string; currency: string }): Record<string, string> {
  if (s.assetType === "crypto") {
    const base = s.ticker.endsWith(s.currency) ? s.ticker.slice(0, -s.currency.length) : s.ticker;
    return { function: "DIGITAL_CURRENCY_DAILY", symbol: base.replace(/[-_.]$/, ""), market: s.currency };
  }
  if (s.assetType === "forex" && /^[A-Z]{6}$/.test(s.ticker)) {
    return { function: "FX_DAILY", from_symbol: s.ticker.slice(0, 3), to_symbol: s.ticker.slice(3) };
  }
  return { function: "TIME_SERIES_DAILY", symbol: s.ticker, outputsize: "compact" };
}

/** Daily bars for a symbol from the market-data provider, oldest first. */
async function fetchDaily(s: { ticker: string; assetType: string; currency: string }, key: string): Promise<Bar[]> {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...seriesParams(s), apikey: key })) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`market data ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  const seriesKey = Object.keys(body).find((k) => k.startsWith("Time Series"));
  const series = seriesKey ? (body[seriesKey] as Record<string, Record<string, string>>) : null;
  if (!series) return [];
  const field = (v: Record<string, string>, name: string) => {
    const k = Object.keys(v).find((key) => key.includes(name));
    return k ? Number(v[k]) : name === "volume" ? 0 : NaN;
  };
  return Object.entries(series)
    .map(([date, v]) => ({
      time: Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 1000,
      open: field(v, "open"),
      high: field(v, "high"),
      low: field(v, "low"),
      close: field(v, "close"),
      volume: field(v, "volume"),
    }))
    .filter((b) => Number.isFinite(b.time) && [b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

/** The daily job: new daily bars for every symbol. Off without a key. */
export async function refreshDailyBars(): Promise<void> {
  const key = (env as { MARKET_DATA_API_KEY?: string }).MARKET_DATA_API_KEY;
  if (!key) return;
  const all = await db
    .select({ id: symbols.id, ticker: symbols.ticker, assetType: symbols.assetType, currency: symbols.currency })
    .from(symbols);
  for (const s of all) {
    try {
      const daily = await fetchDaily(s, key);
      // Only bars after the symbol's latest one are added; older ones are updated in place.
      await upsertBars(s.id, daily.slice(-5));
    } catch (error) {
      console.error("market data refresh failed", s.ticker, error);
    }
  }
}
