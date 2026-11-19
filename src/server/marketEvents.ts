import { and, eq } from "drizzle-orm";
import { waitUntil } from "cloudflare:workers";
import { env } from "cloudflare:workers";
import { GatewayRefusalError, sendEmail } from "@every-app/sdk/server";
import { db } from "@/db";
import { alertEvents, alerts, symbols, users } from "@/db/schema";
import { ALERT_CONDITION_LABELS, alertMet, type AlertCondition, type Bar } from "@/lib/market";
import { expireDue } from "@/server/alerts";
import { fillWorkingOrders } from "@/server/paper";

/**
 * New bars arrived for a symbol (an import or the daily fetch): check its
 * alerts and fill its working paper orders, oldest bar first.
 */
export async function onNewBars(symbolId: string, prevClose: number | null, fresh: Bar[]) {
  await evaluateAlerts(symbolId, prevClose, fresh);
  await fillWorkingOrders(symbolId, fresh);
}

async function evaluateAlerts(symbolId: string, prevClose: number | null, fresh: Bar[]) {
  await expireDue({ symbolId });
  const active = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.symbolId, symbolId), eq(alerts.status, "active")));
  if (active.length === 0) return;
  const [symbol] = await db.select({ ticker: symbols.ticker, orgId: symbols.orgId }).from(symbols).where(eq(symbols.id, symbolId));
  const now = new Date().toISOString();
  const statements = [];
  const mails: { ownerId: string; subject: string; text: string }[] = [];
  for (const alert of active) {
    let prev = prevClose;
    let lastFired = alert.lastFiredBarTime ?? -Infinity;
    let triggered = false;
    for (const bar of fresh) {
      const met = alertMet(alert.condition as AlertCondition, alert.value, alert.value2, prev, bar);
      prev = bar.close;
      if (!met || bar.time <= lastFired) continue;
      lastFired = bar.time;
      statements.push(
        db
          .insert(alertEvents)
          .values({ id: crypto.randomUUID(), alertId: alert.id, ownerId: alert.ownerId, barTime: bar.time, price: bar.close, message: alert.message || `${symbol?.ticker} ${ALERT_CONDITION_LABELS[alert.condition as AlertCondition].toLowerCase()} ${alert.value}`, firedAt: now })
          .onConflictDoNothing(),
      );
      if (alert.notifyEmail) {
        mails.push({
          ownerId: alert.ownerId,
          subject: `Alert: ${symbol?.ticker} at ${bar.close}`,
          text: `${alert.message || `${symbol?.ticker} ${ALERT_CONDITION_LABELS[alert.condition as AlertCondition].toLowerCase()} ${alert.value}`}\n\n${symbol?.ticker} closed at ${bar.close} on ${new Date(bar.time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC.`,
        });
      }
      if (alert.frequency === "once") {
        triggered = true;
        break;
      }
    }
    if (lastFired !== (alert.lastFiredBarTime ?? -Infinity)) {
      statements.push(
        db
          .update(alerts)
          .set({ lastFiredBarTime: lastFired, ...(triggered ? { status: "triggered" } : {}) })
          .where(eq(alerts.id, alert.id)),
      );
    }
  }
  if (statements.length > 0) await db.batch(statements as [(typeof statements)[0], ...typeof statements]);
  if (mails.length > 0 && symbol) waitUntil(sendMails(symbol.orgId, mails));
}

async function sendMails(orgId: string, mails: { ownerId: string; subject: string; text: string }[]) {
  for (const mail of mails) {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, mail.ownerId));
    if (!user) continue;
    try {
      await sendEmail({
        env,
        for: { background: true, organizationId: orgId },
        message: { to: [user.email], subject: mail.subject, text: mail.text },
      });
    } catch (error) {
      // Email is optional: the alert log already has the event.
      if (!(error instanceof GatewayRefusalError)) console.error("alert email failed", error);
    }
  }
}
