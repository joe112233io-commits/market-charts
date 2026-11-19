import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { screens, symbols } from "@/db/schema";
import { ASSET_TYPES, rsi, sma } from "@/lib/market";
import { notFound, type Actor } from "@/server/users";

const num = z.coerce.number().finite().optional();
export const screenFilters = z
  .object({
    assetType: z.enum(ASSET_TYPES).optional(),
    exchange: z.string().trim().max(40).optional(),
    minPrice: num,
    maxPrice: num,
    minChangePct: num,
    maxChangePct: num,
    minVolume: num,
    minRsi: num,
    maxRsi: num,
    sma50: z.enum(["any", "above", "below"]).optional(),
    sma200: z.enum(["any", "above", "below"]).optional(),
  })
  .strict();
export type ScreenFilters = z.infer<typeof screenFilters>;

export const SORT_KEYS = ["ticker", "name", "exchange", "assetType", "last", "changePct", "volume", "rsi14", "sma50", "sma200"] as const;
export const runScreenInput = z
  .object({
    filters: screenFilters,
    sort: z.enum(SORT_KEYS).default("ticker"),
    dir: z.enum(["asc", "desc"]).default("asc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export interface ScreenRow {
  symbolId: string;
  ticker: string;
  name: string;
  exchange: string;
  assetType: string;
  last: number;
  changePct: number | null;
  volume: number;
  rsi14: number | null;
  sma50: number | null;
  sma200: number | null;
}

async function computeRows(actor: Actor): Promise<ScreenRow[]> {
  const list = await db
    .select({ id: symbols.id, ticker: symbols.ticker, name: symbols.name, exchange: symbols.exchange, assetType: symbols.assetType })
    .from(symbols)
    .where(eq(symbols.orgId, actor.orgId));
  const closes = new Map<string, { close: number; volume: number }[]>();
  for (let i = 0; i < list.length; i += 90) {
    const ids = list.slice(i, i + 90).map((s) => s.id);
    const rows = await db.all<{ symbol_id: string; close: number; volume: number }>(sql`
      SELECT symbol_id, close, volume FROM (
        SELECT symbol_id, time, close, volume,
          ROW_NUMBER() OVER (PARTITION BY symbol_id ORDER BY time DESC) AS rn
        FROM bars WHERE symbol_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      ) WHERE rn <= 250 ORDER BY symbol_id, time`);
    for (const r of rows) {
      const arr = closes.get(r.symbol_id) ?? [];
      arr.push({ close: r.close, volume: r.volume });
      closes.set(r.symbol_id, arr);
    }
  }
  const out: ScreenRow[] = [];
  for (const s of list) {
    const series = closes.get(s.id);
    if (!series || series.length === 0) continue;
    const values = series.map((b) => b.close);
    const last = values.at(-1)!;
    const prev = values.length > 1 ? values.at(-2)! : null;
    out.push({
      symbolId: s.id,
      ticker: s.ticker,
      name: s.name,
      exchange: s.exchange,
      assetType: s.assetType,
      last,
      changePct: prev ? ((last - prev) / prev) * 100 : null,
      volume: series.at(-1)!.volume,
      rsi14: rsi(values, 14).at(-1) ?? null,
      sma50: sma(values, 50).at(-1) ?? null,
      sma200: sma(values, 200).at(-1) ?? null,
    });
  }
  return out;
}

function within(v: number | null, min?: number, max?: number) {
  if (min == null && max == null) return true;
  if (v == null) return false;
  return (min == null || v >= min) && (max == null || v <= max);
}

function side(last: number, ma: number | null, want?: "any" | "above" | "below") {
  if (!want || want === "any") return true;
  if (ma == null) return false;
  return want === "above" ? last > ma : last < ma;
}

export async function runScreen(actor: Actor, input: z.infer<typeof runScreenInput>) {
  const f = input.filters;
  const rows = (await computeRows(actor)).filter(
    (r) =>
      (!f.assetType || r.assetType === f.assetType) &&
      (!f.exchange || r.exchange.toUpperCase() === f.exchange.toUpperCase()) &&
      within(r.last, f.minPrice, f.maxPrice) &&
      within(r.changePct, f.minChangePct, f.maxChangePct) &&
      (f.minVolume == null || r.volume >= f.minVolume) &&
      within(r.rsi14, f.minRsi, f.maxRsi) &&
      side(r.last, r.sma50, f.sma50) &&
      side(r.last, r.sma200, f.sma200),
  );
  const dir = input.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = a[input.sort];
    const y = b[input.sort];
    if (x == null && y == null) return a.ticker.localeCompare(b.ticker);
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y));
    return c * dir || a.ticker.localeCompare(b.ticker);
  });
  const start = (input.page - 1) * input.pageSize;
  return { rows: rows.slice(start, start + input.pageSize), total: rows.length, page: input.page, pageSize: input.pageSize };
}

export const saveScreenInput = z.object({ name: z.string().trim().min(1, "Name is required").max(80), filters: screenFilters }).strict();

const shown = { id: screens.id, name: screens.name, filters: screens.filters };

export async function listScreens(actor: Actor) {
  const rows = await db.select(shown).from(screens).where(eq(screens.ownerId, actor.id)).orderBy(desc(screens.createdAt));
  return rows as { id: string; name: string; filters: ScreenFilters }[];
}

export async function getScreen(actor: Actor, id: string) {
  const [row] = await db.select(shown).from(screens).where(and(eq(screens.id, id), eq(screens.ownerId, actor.id)));
  return (row ?? notFound("Screen")) as { id: string; name: string; filters: ScreenFilters };
}

export async function saveScreen(actor: Actor, input: z.infer<typeof saveScreenInput>) {
  const id = crypto.randomUUID();
  await db.insert(screens).values({ id, ownerId: actor.id, name: input.name, filters: input.filters });
  return getScreen(actor, id);
}

export async function deleteScreen(actor: Actor, id: string) {
  await getScreen(actor, id);
  await db.delete(screens).where(and(eq(screens.id, id), eq(screens.ownerId, actor.id)));
  return { deleted: true as const };
}
