import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { paperAccounts, paperOrders, paperPositions, symbols } from "@/db/schema";
import { workingFillPrice, type Bar } from "@/lib/market";
import { quotesFor, requireSymbol } from "@/server/symbols";
import { tickerSchema } from "@/server/ticker";
import { AppError, notFound, type Actor } from "@/server/users";
import { applyFill, type AccountState, type FillOutcome, type PositionState } from "@/server/paperMath";

export const createAccountInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    startingBalance: z.number().positive("Starting balance must be above 0").max(1e12),
    currency: z.string().trim().min(3).max(5).transform((s) => s.toUpperCase()).default("USD"),
    commissionPct: z.number().min(0).max(10).default(0),
  })
  .strict();

export const placeOrderInput = z
  .object({
    ticker: tickerSchema.optional(),
    symbolId: z.string().optional(),
    side: z.enum(["buy", "sell"]),
    type: z.enum(["market", "limit", "stop"]),
    qty: z.number().positive("Quantity must be above 0").max(1e9),
    price: z.number().positive().optional(),
  })
  .strict()
  .refine((o) => o.ticker || o.symbolId, "Choose a symbol")
  .refine((o) => o.type === "market" || o.price != null, "Limit and stop orders need a price");

/** The statements that write a fill's account and position. */
export function fillStatements(accountId: string, symbolId: string, outcome: Extract<FillOutcome, { ok: true }>) {
  return [
    db.update(paperAccounts).set({ cash: outcome.cash, realizedPnl: outcome.realizedPnl }).where(eq(paperAccounts.id, accountId)),
    outcome.position
      ? db
          .insert(paperPositions)
          .values({ accountId, symbolId, ...outcome.position })
          .onConflictDoUpdate({ target: [paperPositions.accountId, paperPositions.symbolId], set: outcome.position })
      : db.delete(paperPositions).where(and(eq(paperPositions.accountId, accountId), eq(paperPositions.symbolId, symbolId))),
  ];
}

const accountCols = {
  id: paperAccounts.id,
  name: paperAccounts.name,
  currency: paperAccounts.currency,
  startingBalance: paperAccounts.startingBalance,
  commissionPct: paperAccounts.commissionPct,
  cash: paperAccounts.cash,
  realizedPnl: paperAccounts.realizedPnl,
  createdAt: paperAccounts.createdAt,
};

async function requireAccount(actor: Actor, id: string) {
  const [row] = await db
    .select(accountCols)
    .from(paperAccounts)
    .where(and(eq(paperAccounts.id, id), eq(paperAccounts.ownerId, actor.id)));
  return row ?? notFound("Account");
}

export async function listAccounts(actor: Actor) {
  const rows = await db.select(accountCols).from(paperAccounts).where(eq(paperAccounts.ownerId, actor.id)).orderBy(paperAccounts.createdAt);
  const out = [];
  for (const r of rows) out.push({ ...r, equity: (await summarize(r)).equity });
  return out;
}

export async function createAccount(actor: Actor, input: z.infer<typeof createAccountInput>) {
  const [row] = await db
    .insert(paperAccounts)
    .values({ id: crypto.randomUUID(), ownerId: actor.id, ...input, cash: input.startingBalance })
    .returning(accountCols);
  return row!;
}

async function positionsOf(accountId: string) {
  return db
    .select({ symbolId: paperPositions.symbolId, ticker: symbols.ticker, qty: paperPositions.qty, avgPrice: paperPositions.avgPrice })
    .from(paperPositions)
    .innerJoin(symbols, eq(symbols.id, paperPositions.symbolId))
    .where(eq(paperPositions.accountId, accountId))
    .orderBy(symbols.ticker);
}

async function summarize(account: { id: string; cash: number; realizedPnl: number }) {
  const positions = await positionsOf(account.id);
  const quotes = await quotesFor(positions.map((p) => p.symbolId));
  let marketValue = 0;
  let unrealizedPnl = 0;
  const rows = positions.map((p) => {
    const last = quotes.get(p.symbolId)?.last ?? p.avgPrice;
    const value = p.qty * last;
    const pnl = (last - p.avgPrice) * p.qty;
    marketValue += value;
    unrealizedPnl += pnl;
    return { ...p, last, marketValue: value, unrealizedPnl: pnl };
  });
  return { positions: rows, marketValue, unrealizedPnl, realizedPnl: account.realizedPnl, equity: account.cash + marketValue };
}

export async function getAccount(actor: Actor, id: string) {
  const account = await requireAccount(actor, id);
  const { positions, ...summary } = await summarize(account);
  const orders = await db
    .select({
      id: paperOrders.id,
      symbolId: paperOrders.symbolId,
      ticker: symbols.ticker,
      side: paperOrders.side,
      type: paperOrders.type,
      qty: paperOrders.qty,
      price: paperOrders.price,
      status: paperOrders.status,
      reason: paperOrders.reason,
      filledPrice: paperOrders.filledPrice,
      commission: paperOrders.commission,
      createdAt: paperOrders.createdAt,
      filledAt: paperOrders.filledAt,
    })
    .from(paperOrders)
    .innerJoin(symbols, eq(symbols.id, paperOrders.symbolId))
    .where(eq(paperOrders.accountId, account.id))
    .orderBy(desc(paperOrders.createdAt), desc(paperOrders.id))
    .limit(500);
  return { account, positions, orders, summary };
}

export async function placeOrder(actor: Actor, accountId: string, input: z.infer<typeof placeOrderInput>) {
  const account = await requireAccount(actor, accountId);
  const symbol = await requireSymbol(actor, input.symbolId ? { id: input.symbolId } : { ticker: input.ticker });
  const [position] = await db
    .select({ qty: paperPositions.qty, avgPrice: paperPositions.avgPrice })
    .from(paperPositions)
    .where(and(eq(paperPositions.accountId, account.id), eq(paperPositions.symbolId, symbol.id)));
  const now = new Date().toISOString();
  const base = {
    id: crypto.randomUUID(),
    accountId: account.id,
    symbolId: symbol.id,
    side: input.side,
    type: input.type,
    qty: input.qty,
    price: input.type === "market" ? null : input.price!,
    createdAt: now,
  };
  const write = async (values: Partial<typeof paperOrders.$inferInsert>, extra: Parameters<typeof db.batch>[0][number][] = []) => {
    const insert = db.insert(paperOrders).values({ ...base, status: "working", ...values });
    await db.batch([insert, ...extra] as unknown as Parameters<typeof db.batch>[0]);
    const [order] = await db.select().from(paperOrders).where(eq(paperOrders.id, base.id));
    return { ...order!, ticker: symbol.ticker };
  };

  if (input.type === "market") {
    const last = (await quotesFor([symbol.id])).get(symbol.id)?.last;
    if (last == null) return write({ status: "rejected", reason: "No price for this symbol yet" });
    const outcome = applyFill(account, position ?? null, input.side, input.qty, last);
    if (!outcome.ok) return write({ status: "rejected", reason: outcome.reason });
    return write(
      { status: "filled", filledPrice: last, commission: outcome.commission, filledAt: now },
      fillStatements(account.id, symbol.id, outcome),
    );
  }
  // A working order is checked against what the account has now and again when it fills.
  const check = applyFill(account, position ?? null, input.side, input.qty, input.price!);
  if (!check.ok) return write({ status: "rejected", reason: check.reason });
  return write({ status: "working" });
}

export async function cancelOrder(actor: Actor, accountId: string, orderId: string) {
  const account = await requireAccount(actor, accountId);
  const [order] = await db
    .update(paperOrders)
    .set({ status: "cancelled" })
    .where(and(eq(paperOrders.id, orderId), eq(paperOrders.accountId, account.id), eq(paperOrders.status, "working")))
    .returning();
  if (!order) throw new AppError(409, "Only working orders can be cancelled");
  return order;
}

export async function resetAccount(actor: Actor, accountId: string) {
  const account = await requireAccount(actor, accountId);
  await db.batch([
    db.delete(paperOrders).where(eq(paperOrders.accountId, account.id)),
    db.delete(paperPositions).where(eq(paperPositions.accountId, account.id)),
    db.update(paperAccounts).set({ cash: account.startingBalance, realizedPnl: 0 }).where(eq(paperAccounts.id, account.id)),
  ]);
  return { reset: true as const };
}

export async function deleteAccount(actor: Actor, accountId: string) {
  const account = await requireAccount(actor, accountId);
  await db.delete(paperAccounts).where(and(eq(paperAccounts.id, account.id), eq(paperAccounts.ownerId, actor.id)));
  return { deleted: true as const };
}

/** Working orders on this symbol fill against new bars, oldest bar first. */
export async function fillWorkingOrders(symbolId: string, newBars: Bar[]) {
  const working = await db
    .select({
      id: paperOrders.id,
      accountId: paperOrders.accountId,
      side: paperOrders.side,
      type: paperOrders.type,
      qty: paperOrders.qty,
      price: paperOrders.price,
    })
    .from(paperOrders)
    .where(and(eq(paperOrders.symbolId, symbolId), eq(paperOrders.status, "working")))
    .orderBy(paperOrders.createdAt);
  if (working.length === 0) return 0;
  const accounts = new Map<string, AccountState>();
  const positions = new Map<string, PositionState | null>();
  const statements: Parameters<typeof db.batch>[0][number][] = [];
  const touched = new Set<string>();
  let filled = 0;
  const pending = new Set(working.map((o) => o.id));
  for (const bar of newBars) {
    for (const order of working) {
      if (!pending.has(order.id)) continue;
      const price = workingFillPrice(order.side as "buy" | "sell", order.type as "limit" | "stop", order.price!, bar);
      if (price == null) continue;
      pending.delete(order.id);
      if (!accounts.has(order.accountId)) {
        const [a] = await db
          .select({ id: paperAccounts.id, cash: paperAccounts.cash, realizedPnl: paperAccounts.realizedPnl, commissionPct: paperAccounts.commissionPct })
          .from(paperAccounts)
          .where(eq(paperAccounts.id, order.accountId));
        const [p] = await db
          .select({ qty: paperPositions.qty, avgPrice: paperPositions.avgPrice })
          .from(paperPositions)
          .where(and(eq(paperPositions.accountId, order.accountId), eq(paperPositions.symbolId, symbolId)));
        accounts.set(order.accountId, a!);
        positions.set(order.accountId, p ?? null);
      }
      const account = accounts.get(order.accountId)!;
      const outcome = applyFill(account, positions.get(order.accountId) ?? null, order.side as "buy" | "sell", order.qty, price);
      const at = new Date(bar.time * 1000).toISOString();
      if (!outcome.ok) {
        statements.push(db.update(paperOrders).set({ status: "rejected", reason: outcome.reason }).where(eq(paperOrders.id, order.id)));
        continue;
      }
      account.cash = outcome.cash;
      account.realizedPnl = outcome.realizedPnl;
      positions.set(order.accountId, outcome.position);
      touched.add(order.accountId);
      filled++;
      statements.push(
        db.update(paperOrders).set({ status: "filled", filledPrice: price, commission: outcome.commission, filledAt: at }).where(eq(paperOrders.id, order.id)),
      );
    }
  }
  for (const accountId of touched) {
    const a = accounts.get(accountId)!;
    statements.push(
      ...fillStatements(accountId, symbolId, { ok: true, cash: a.cash, realizedPnl: a.realizedPnl, position: positions.get(accountId) ?? null, commission: 0 }),
    );
  }
  if (statements.length > 0) await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  return filled;
}
