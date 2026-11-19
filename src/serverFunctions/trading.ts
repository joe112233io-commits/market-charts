import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as alerts from "@/server/alerts";
import * as paper from "@/server/paper";
import { actorMiddleware } from "./middleware";

const idInput = z.object({ id: z.string() }).strict();

export const getAlertsFn = createServerFn()
  .middleware([actorMiddleware])
  .handler(async ({ context }) => ({
    alerts: await alerts.listAlerts(context.actor),
    events: await alerts.listEvents(context.actor),
  }));

export const createAlertFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => alerts.createAlertInput.parse(d))
  .handler(({ data, context }) => alerts.createAlert(context.actor, data));

export const updateAlertFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => alerts.updateAlertInput.parse(d))
  .handler(({ data, context }) => alerts.updateAlert(context.actor, data));

export const pauseAlertFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), paused: z.boolean() }).strict().parse(d))
  .handler(({ data, context }) => alerts.setPaused(context.actor, data.id, data.paused));

export const deleteAlertFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => alerts.deleteAlert(context.actor, data.id));

export const listAccountsFn = createServerFn()
  .middleware([actorMiddleware])
  .handler(({ context }) => paper.listAccounts(context.actor));

export const createAccountFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => paper.createAccountInput.parse(d))
  .handler(({ data, context }) => paper.createAccount(context.actor, data));

export const getAccountFn = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => paper.getAccount(context.actor, data.id));

export const placeOrderFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ accountId: z.string(), order: z.unknown() }).strict().parse(d))
  .handler(({ data, context }) => paper.placeOrder(context.actor, data.accountId, paper.placeOrderInput.parse(data.order)));

export const cancelOrderFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ accountId: z.string(), orderId: z.string() }).strict().parse(d))
  .handler(({ data, context }) => paper.cancelOrder(context.actor, data.accountId, data.orderId));

export const resetAccountFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => paper.resetAccount(context.actor, data.id));

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => paper.deleteAccount(context.actor, data.id));
