import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alertEvents, alerts, symbols } from "@/db/schema";
import { ALERT_CONDITIONS, isChannel } from "@/lib/market";
import { requireSymbol } from "@/server/symbols";
import { tickerSchema } from "@/server/ticker";
import { AppError, notFound, type Actor } from "@/server/users";

const alertFields = {
  condition: z.enum(ALERT_CONDITIONS),
  value: z.number().finite(),
  value2: z.number().finite().nullable().optional(),
  frequency: z.enum(["once", "once_per_bar"]),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((s) => (s ? new Date(s).toISOString() : null)),
  message: z.string().trim().max(300).default(""),
  notifyEmail: z.boolean().default(false),
};

function checkValues(a: { condition: (typeof ALERT_CONDITIONS)[number]; value: number; value2?: number | null }) {
  if (isChannel(a.condition) && (a.value2 == null || a.value2 === a.value)) {
    throw new AppError(400, "A channel needs a lower and an upper value");
  }
  if ((a.condition === "moving_up_pct" || a.condition === "moving_down_pct") && a.value <= 0) {
    throw new AppError(400, "The percentage must be above 0");
  }
}

export const createAlertInput = z
  .object({ ticker: tickerSchema.optional(), symbolId: z.string().optional(), ...alertFields })
  .strict()
  .refine((a) => a.ticker || a.symbolId, "Choose a symbol");

export const updateAlertInput = z.object({ id: z.string(), symbolId: z.string(), ...alertFields }).strict();

const shown = {
  id: alerts.id,
  symbolId: alerts.symbolId,
  ticker: symbols.ticker,
  condition: alerts.condition,
  value: alerts.value,
  value2: alerts.value2,
  frequency: alerts.frequency,
  expiresAt: alerts.expiresAt,
  status: alerts.status,
  message: alerts.message,
  notifyEmail: alerts.notifyEmail,
  createdAt: alerts.createdAt,
};

/** Alerts past their expiry stop being active. */
export async function expireDue(where?: { ownerId?: string; symbolId?: string }) {
  await db
    .update(alerts)
    .set({ status: "expired" })
    .where(
      and(
        inArray(alerts.status, ["active", "paused"]),
        isNotNull(alerts.expiresAt),
        lte(alerts.expiresAt, new Date().toISOString()),
        where?.ownerId ? eq(alerts.ownerId, where.ownerId) : undefined,
        where?.symbolId ? eq(alerts.symbolId, where.symbolId) : undefined,
      ),
    );
}

export async function listAlerts(actor: Actor) {
  await expireDue({ ownerId: actor.id });
  return db
    .select(shown)
    .from(alerts)
    .innerJoin(symbols, eq(symbols.id, alerts.symbolId))
    .where(eq(alerts.ownerId, actor.id))
    .orderBy(desc(alerts.createdAt), alerts.id);
}

export async function getAlert(actor: Actor, id: string) {
  await expireDue({ ownerId: actor.id });
  const [row] = await db
    .select(shown)
    .from(alerts)
    .innerJoin(symbols, eq(symbols.id, alerts.symbolId))
    .where(and(eq(alerts.id, id), eq(alerts.ownerId, actor.id)));
  return row ?? notFound("Alert");
}

export async function createAlert(actor: Actor, input: z.infer<typeof createAlertInput>) {
  checkValues(input);
  const symbol = await requireSymbol(actor, input.symbolId ? { id: input.symbolId } : { ticker: input.ticker });
  const id = crypto.randomUUID();
  await db.insert(alerts).values({
    id,
    ownerId: actor.id,
    symbolId: symbol.id,
    condition: input.condition,
    value: input.value,
    value2: isChannel(input.condition) ? input.value2 : null,
    frequency: input.frequency,
    expiresAt: input.expiresAt,
    status: "active",
    message: input.message,
    notifyEmail: input.notifyEmail,
  });
  return getAlert(actor, id);
}

/** Editing an alert makes it active again. */
export async function updateAlert(actor: Actor, input: z.infer<typeof updateAlertInput>) {
  checkValues(input);
  await getAlert(actor, input.id);
  const symbol = await requireSymbol(actor, { id: input.symbolId });
  await db
    .update(alerts)
    .set({
      symbolId: symbol.id,
      condition: input.condition,
      value: input.value,
      value2: isChannel(input.condition) ? input.value2 : null,
      frequency: input.frequency,
      expiresAt: input.expiresAt,
      message: input.message,
      notifyEmail: input.notifyEmail,
      status: "active",
      lastFiredBarTime: null,
    })
    .where(and(eq(alerts.id, input.id), eq(alerts.ownerId, actor.id)));
  return getAlert(actor, input.id);
}

export async function setPaused(actor: Actor, id: string, paused: boolean) {
  const alert = await getAlert(actor, id);
  const from = paused ? "active" : "paused";
  if (alert.status !== from) throw new AppError(409, paused ? "Only active alerts can be paused" : "Only paused alerts can be resumed");
  await db
    .update(alerts)
    .set({ status: paused ? "paused" : "active" })
    .where(and(eq(alerts.id, id), eq(alerts.ownerId, actor.id)));
  return getAlert(actor, id);
}

export async function deleteAlert(actor: Actor, id: string) {
  await getAlert(actor, id);
  await db.delete(alerts).where(and(eq(alerts.id, id), eq(alerts.ownerId, actor.id)));
  return { deleted: true as const };
}

export async function listEvents(actor: Actor) {
  return db
    .select({
      id: alertEvents.id,
      alertId: alertEvents.alertId,
      ticker: symbols.ticker,
      price: alertEvents.price,
      barTime: alertEvents.barTime,
      message: alertEvents.message,
      firedAt: alertEvents.firedAt,
    })
    .from(alertEvents)
    .innerJoin(alerts, eq(alerts.id, alertEvents.alertId))
    .innerJoin(symbols, eq(symbols.id, alerts.symbolId))
    .where(eq(alertEvents.ownerId, actor.id))
    .orderBy(desc(alertEvents.firedAt), desc(alertEvents.barTime))
    .limit(500);
}
