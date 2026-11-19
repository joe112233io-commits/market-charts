import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chartLayouts, symbols } from "@/db/schema";
import { INTERVALS } from "@/lib/market";
import { CHART_TYPES, DRAWING_KINDS, INDICATOR_TYPES } from "@/lib/chart";
import { requireSymbol } from "@/server/symbols";
import { notFound, type Actor } from "@/server/users";

const point = z.object({ time: z.number().finite(), price: z.number().finite() }).strict();

export const layoutState = {
  symbolId: z.string().min(1),
  interval: z.enum(INTERVALS),
  chartType: z.enum(CHART_TYPES),
  indicators: z
    .array(
      z
        .object({
          id: z.string().min(1).max(40),
          type: z.enum(INDICATOR_TYPES),
          params: z.record(z.string(), z.number().finite()),
        })
        .strict(),
    )
    .max(20),
  drawings: z
    .array(
      z
        .object({
          id: z.string().min(1).max(40),
          kind: z.enum(DRAWING_KINDS),
          points: z.array(point).min(1).max(2),
          text: z.string().max(200).optional(),
        })
        .strict(),
    )
    .max(200),
};

export const saveLayoutInput = z.object({ name: z.string().trim().min(1, "Name is required").max(80), ...layoutState }).strict();
export const updateLayoutInput = z.object({ id: z.string(), ...layoutState }).strict();
export const renameLayoutInput = z.object({ id: z.string(), name: z.string().trim().min(1, "Name is required").max(80) }).strict();

export type LayoutState = z.infer<z.ZodObject<typeof layoutState>>;

const shown = {
  id: chartLayouts.id,
  name: chartLayouts.name,
  symbolId: chartLayouts.symbolId,
  ticker: symbols.ticker,
  interval: chartLayouts.interval,
  chartType: chartLayouts.chartType,
  indicators: chartLayouts.indicators,
  drawings: chartLayouts.drawings,
  updatedAt: chartLayouts.updatedAt,
};

export async function listLayouts(actor: Actor) {
  const rows = await db
    .select(shown)
    .from(chartLayouts)
    .innerJoin(symbols, eq(symbols.id, chartLayouts.symbolId))
    .where(eq(chartLayouts.ownerId, actor.id))
    .orderBy(desc(chartLayouts.updatedAt));
  return rows.map(({ indicators, drawings, ...r }) => ({
    ...r,
    indicatorCount: (indicators as unknown[]).length,
    drawingCount: (drawings as unknown[]).length,
  }));
}

export async function getLayout(actor: Actor, id: string) {
  const [row] = await db
    .select(shown)
    .from(chartLayouts)
    .innerJoin(symbols, eq(symbols.id, chartLayouts.symbolId))
    .where(and(eq(chartLayouts.id, id), eq(chartLayouts.ownerId, actor.id)));
  if (!row) notFound("Layout");
  return row as typeof row & Pick<LayoutState, "indicators" | "drawings" | "interval" | "chartType">;
}

export async function saveLayout(actor: Actor, input: z.infer<typeof saveLayoutInput>) {
  await requireSymbol(actor, { id: input.symbolId });
  const id = crypto.randomUUID();
  await db.insert(chartLayouts).values({ id, ownerId: actor.id, ...input, updatedAt: new Date().toISOString() });
  return getLayout(actor, id);
}

export async function updateLayout(actor: Actor, { id, ...state }: z.infer<typeof updateLayoutInput>) {
  await getLayout(actor, id);
  await requireSymbol(actor, { id: state.symbolId });
  await db
    .update(chartLayouts)
    .set({ ...state, updatedAt: new Date().toISOString() })
    .where(and(eq(chartLayouts.id, id), eq(chartLayouts.ownerId, actor.id)));
  return getLayout(actor, id);
}

export async function renameLayout(actor: Actor, { id, name }: z.infer<typeof renameLayoutInput>) {
  await getLayout(actor, id);
  await db.update(chartLayouts).set({ name }).where(and(eq(chartLayouts.id, id), eq(chartLayouts.ownerId, actor.id)));
  return getLayout(actor, id);
}

export async function deleteLayout(actor: Actor, id: string) {
  await getLayout(actor, id);
  await db.delete(chartLayouts).where(and(eq(chartLayouts.id, id), eq(chartLayouts.ownerId, actor.id)));
  return { deleted: true as const };
}
