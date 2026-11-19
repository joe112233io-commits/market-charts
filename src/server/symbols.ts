import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bars, symbols } from "@/db/schema";
import {
  ASSET_TYPES,
  aggregate,
  INTERVALS,
  isIntraday,
  parseBarsCsv,
  type Bar,
} from "@/lib/market";
import { onNewBars } from "@/server/marketEvents";
import { tickerSchema } from "@/server/ticker";
import { AppError, notFound, type Actor } from "@/server/users";

export const createSymbolInput = z
  .object({
    ticker: tickerSchema,
    name: z.string().trim().min(1, "Name is required").max(120),
    exchange: z.string().trim().min(1, "Exchange is required").max(40).transform((s) => s.toUpperCase()),
    assetType: z.enum(ASSET_TYPES),
    currency: z.string().trim().min(3).max(5).transform((s) => s.toUpperCase()),
  })
  .strict();

export const intervalSchema = z.enum(INTERVALS);

export interface Quote {
  last: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
}

export interface SymbolRow extends Quote {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  assetType: string;
  currency: string;
  createdBy: string;
}

export interface SymbolDetail extends SymbolRow {
  firstTime: string | null;
  lastTime: string | null;
  barCount: number;
  hasIntraday: boolean;
  canDelete: boolean;
}

const symbolCols = {
  id: symbols.id,
  ticker: symbols.ticker,
  name: symbols.name,
  exchange: symbols.exchange,
  assetType: symbols.assetType,
  currency: symbols.currency,
  createdBy: symbols.createdBy,
};

/** Last price, change from the previous bar, and volume, per symbol. */
export async function quotesFor(symbolIds: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (symbolIds.length === 0) return out;
  const rows: { symbol_id: string; close: number; volume: number; rn: number }[] = [];
  for (let i = 0; i < symbolIds.length; i += 90) {
    const ids = symbolIds.slice(i, i + 90);
    rows.push(
      ...(await db.all<{ symbol_id: string; close: number; volume: number; rn: number }>(sql`
        SELECT symbol_id, close, volume, rn FROM (
          SELECT symbol_id, close, volume,
            ROW_NUMBER() OVER (PARTITION BY symbol_id ORDER BY time DESC) AS rn
          FROM bars WHERE symbol_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        ) WHERE rn <= 2`)),
    );
  }
  const grouped = new Map<string, { last?: { close: number; volume: number }; prev?: number }>();
  for (const r of rows) {
    const g = grouped.get(r.symbol_id) ?? {};
    if (r.rn === 1) g.last = { close: r.close, volume: r.volume };
    else g.prev = r.close;
    grouped.set(r.symbol_id, g);
  }
  for (const id of symbolIds) {
    const g = grouped.get(id);
    const last = g?.last?.close ?? null;
    const prev = g?.prev ?? null;
    const change = last != null && prev != null ? last - prev : null;
    out.set(id, {
      last,
      change,
      changePct: change != null && prev ? (change / prev) * 100 : null,
      volume: g?.last?.volume ?? null,
    });
  }
  return out;
}

const empty: Quote = { last: null, change: null, changePct: null, volume: null };

export async function listSymbols(actor: Actor): Promise<SymbolRow[]> {
  const rows = await db
    .select(symbolCols)
    .from(symbols)
    .where(eq(symbols.orgId, actor.orgId))
    .orderBy(asc(symbols.ticker));
  const quotes = await quotesFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...(quotes.get(r.id) ?? empty) }));
}

async function findSymbol(actor: Actor, where: { id?: string; ticker?: string }) {
  const [row] = await db
    .select(symbolCols)
    .from(symbols)
    .where(
      and(
        eq(symbols.orgId, actor.orgId),
        where.id ? eq(symbols.id, where.id) : eq(symbols.ticker, (where.ticker ?? "").toUpperCase()),
      ),
    );
  return row ?? null;
}

/** The symbol of this organization, by id or ticker, or a 404. */
export async function requireSymbol(actor: Actor, ref: { id?: string; ticker?: string }) {
  return (await findSymbol(actor, ref)) ?? notFound("Symbol");
}

export async function getSymbol(actor: Actor, ref: { id?: string; ticker?: string }): Promise<SymbolDetail> {
  const row = await requireSymbol(actor, ref);
  const [range] = await db
    .select({
      first: sql<number | null>`min(${bars.time})`,
      last: sql<number | null>`max(${bars.time})`,
      count: sql<number>`count(*)`,
      intraday: sql<number>`sum(case when ${bars.time} % 86400 != 0 then 1 else 0 end)`,
    })
    .from(bars)
    .where(eq(bars.symbolId, row.id));
  const quote = (await quotesFor([row.id])).get(row.id) ?? empty;
  const iso = (t: number | null | undefined) => (t != null ? new Date(t * 1000).toISOString() : null);
  return {
    ...row,
    ...quote,
    firstTime: iso(range?.first),
    lastTime: iso(range?.last),
    barCount: range?.count ?? 0,
    hasIntraday: (range?.intraday ?? 0) > 0,
    canDelete: actor.admin || row.createdBy === actor.id,
  };
}

export async function createSymbol(actor: Actor, input: z.infer<typeof createSymbolInput>) {
  if (await findSymbol(actor, { ticker: input.ticker })) {
    throw new AppError(409, `${input.ticker} is already in the catalogue`);
  }
  const [row] = await db
    .insert(symbols)
    .values({ id: crypto.randomUUID(), orgId: actor.orgId, createdBy: actor.id, ...input })
    .returning(symbolCols);
  return row!;
}

/** Only an admin or the person who added the symbol may delete it. Its bars and everything built on it go too. */
export async function deleteSymbol(actor: Actor, ref: { id?: string; ticker?: string }) {
  const row = await requireSymbol(actor, ref);
  if (!actor.admin && row.createdBy !== actor.id) {
    throw new AppError(403, "Only an admin or the person who added this symbol can delete it");
  }
  await db.delete(symbols).where(and(eq(symbols.id, row.id), eq(symbols.orgId, actor.orgId)));
  return { deleted: true as const, id: row.id };
}

export async function loadBars(symbolId: string, since?: number): Promise<Bar[]> {
  return db
    .select({ time: bars.time, open: bars.open, high: bars.high, low: bars.low, close: bars.close, volume: bars.volume })
    .from(bars)
    .where(since != null ? and(eq(bars.symbolId, symbolId), gt(bars.time, since)) : eq(bars.symbolId, symbolId))
    .orderBy(asc(bars.time));
}

export async function getBars(actor: Actor, ref: { id?: string; ticker?: string }, interval: z.infer<typeof intervalSchema>) {
  const row = await requireSymbol(actor, ref);
  return aggregate(await loadBars(row.id), interval);
}

/** Bars for the chart in the interval, and whether intraday bars exist. */
export async function chartData(actor: Actor, id: string, interval: z.infer<typeof intervalSchema>) {
  const row = await requireSymbol(actor, { id });
  const raw = await loadBars(row.id);
  const hasIntraday = raw.some((b) => isIntraday(b.time));
  return { ticker: row.ticker, hasIntraday, bars: aggregate(raw, interval) };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Upserts bars into a symbol. Bars newer than the symbol's latest one are new
 * bars: alerts are checked and working paper orders fill against them.
 */
export async function upsertBars(symbolId: string, incoming: Bar[]): Promise<Omit<ImportResult, "skipped" | "errors">> {
  if (incoming.length === 0) return { added: 0, updated: 0 };
  const [latest] = await db
    .select({ time: bars.time, close: bars.close })
    .from(bars)
    .where(eq(bars.symbolId, symbolId))
    .orderBy(sql`${bars.time} desc`)
    .limit(1);
  const times = incoming.map((b) => b.time);
  let existing = 0;
  for (let i = 0; i < times.length; i += 90) {
    const [c] = await db
      .select({ n: sql<number>`count(*)` })
      .from(bars)
      .where(and(eq(bars.symbolId, symbolId), inArray(bars.time, times.slice(i, i + 90))));
    existing += c?.n ?? 0;
  }
  // D1 caps bound parameters per statement: 7 columns x 14 rows stays under 100.
  const statements = [];
  for (let i = 0; i < incoming.length; i += 14) {
    const chunk = incoming.slice(i, i + 14).map((b) => ({ symbolId, ...b }));
    statements.push(
      db
        .insert(bars)
        .values(chunk)
        .onConflictDoUpdate({
          target: [bars.symbolId, bars.time],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`,
          },
        }),
    );
  }
  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50);
    await db.batch(batch as [(typeof batch)[0], ...typeof batch]);
  }
  const fresh = incoming.filter((b) => latest == null || b.time > latest.time);
  if (fresh.length > 0) await onNewBars(symbolId, latest?.close ?? null, fresh);
  return { added: incoming.length - existing, updated: existing };
}

export async function importCsv(actor: Actor, ref: { id?: string; ticker?: string }, csv: string): Promise<ImportResult> {
  const row = await requireSymbol(actor, ref);
  if (csv.length > 5_000_000) throw new AppError(400, "The file is over 5 MB");
  const parsed = parseBarsCsv(csv);
  const result = await upsertBars(row.id, parsed.bars);
  return { ...result, skipped: parsed.errors.length, errors: parsed.errors.slice(0, 100) };
}

