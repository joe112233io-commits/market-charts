import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { symbols, watchlistItems, watchlists } from "@/db/schema";
import { quotesFor, requireSymbol } from "@/server/symbols";
import { tickerSchema } from "@/server/ticker";
import { AppError, notFound, type Actor } from "@/server/users";

export const nameInput = z.object({ name: z.string().trim().min(1, "Name is required").max(80) }).strict();
export const addItemInput = z
  .object({ ticker: tickerSchema.optional(), symbolId: z.string().optional() })
  .strict()
  .refine((i) => i.ticker || i.symbolId, "Choose a symbol");

async function requireList(actor: Actor, id: string) {
  const [row] = await db
    .select({ id: watchlists.id, name: watchlists.name })
    .from(watchlists)
    .where(and(eq(watchlists.id, id), eq(watchlists.ownerId, actor.id)));
  return row ?? notFound("Watchlist");
}

export async function listWatchlists(actor: Actor) {
  return db
    .select({
      id: watchlists.id,
      name: watchlists.name,
      count: sql<number>`(select count(*) from ${watchlistItems} where ${watchlistItems.watchlistId} = ${watchlists.id})`,
    })
    .from(watchlists)
    .where(eq(watchlists.ownerId, actor.id))
    .orderBy(asc(watchlists.createdAt), asc(watchlists.id));
}

export async function createWatchlist(actor: Actor, input: z.infer<typeof nameInput>) {
  const [row] = await db
    .insert(watchlists)
    .values({ id: crypto.randomUUID(), ownerId: actor.id, name: input.name })
    .returning({ id: watchlists.id, name: watchlists.name });
  return row!;
}

export async function renameWatchlist(actor: Actor, id: string, input: z.infer<typeof nameInput>) {
  await requireList(actor, id);
  await db.update(watchlists).set({ name: input.name }).where(and(eq(watchlists.id, id), eq(watchlists.ownerId, actor.id)));
  return requireList(actor, id);
}

export async function deleteWatchlist(actor: Actor, id: string) {
  await requireList(actor, id);
  await db.delete(watchlists).where(and(eq(watchlists.id, id), eq(watchlists.ownerId, actor.id)));
  return { deleted: true as const };
}

export async function getWatchlist(actor: Actor, id: string) {
  const list = await requireList(actor, id);
  const rows = await db
    .select({ symbolId: symbols.id, ticker: symbols.ticker, name: symbols.name, position: watchlistItems.position })
    .from(watchlistItems)
    .innerJoin(symbols, eq(symbols.id, watchlistItems.symbolId))
    .where(eq(watchlistItems.watchlistId, list.id))
    .orderBy(asc(watchlistItems.position));
  const quotes = await quotesFor(rows.map((r) => r.symbolId));
  return { watchlist: list, items: rows.map((r) => ({ ...r, ...quotes.get(r.symbolId)! })) };
}

/** A symbol appears at most once per list. */
export async function addItem(actor: Actor, id: string, input: z.infer<typeof addItemInput>) {
  const list = await requireList(actor, id);
  const symbol = await requireSymbol(actor, input.symbolId ? { id: input.symbolId } : { ticker: input.ticker });
  const [max] = await db
    .select({ p: sql<number | null>`max(${watchlistItems.position})` })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, list.id));
  const inserted = await db
    .insert(watchlistItems)
    .values({ watchlistId: list.id, symbolId: symbol.id, position: (max?.p ?? -1) + 1 })
    .onConflictDoNothing()
    .returning({ symbolId: watchlistItems.symbolId });
  if (inserted.length === 0) throw new AppError(409, `${symbol.ticker} is already in this list`);
  return { symbolId: symbol.id, ticker: symbol.ticker };
}

export async function removeItem(actor: Actor, id: string, symbolId: string) {
  const list = await requireList(actor, id);
  await db.delete(watchlistItems).where(and(eq(watchlistItems.watchlistId, list.id), eq(watchlistItems.symbolId, symbolId)));
  return { removed: true as const };
}

/** Saves the list's order: `symbolIds` is every symbol in it, top first. */
export async function reorderItems(actor: Actor, id: string, symbolIds: string[]) {
  const list = await requireList(actor, id);
  const current = await db
    .select({ symbolId: watchlistItems.symbolId })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, list.id));
  const have = new Set(current.map((c) => c.symbolId));
  if (symbolIds.length !== have.size || symbolIds.some((s) => !have.has(s))) {
    throw new AppError(409, "The list changed; reload and try again");
  }
  const statements = symbolIds.map((symbolId, position) =>
    db
      .update(watchlistItems)
      .set({ position })
      .where(and(eq(watchlistItems.watchlistId, list.id), eq(watchlistItems.symbolId, symbolId))),
  );
  if (statements.length > 0) await db.batch(statements as [(typeof statements)[0], ...typeof statements]);
  return { reordered: true as const };
}
