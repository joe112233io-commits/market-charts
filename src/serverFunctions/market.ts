import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as symbols from "@/server/symbols";
import * as screener from "@/server/screener";
import { actorMiddleware } from "./middleware";

const idInput = z.object({ id: z.string() }).strict();

export const listSymbolsFn = createServerFn()
  .middleware([actorMiddleware])
  .handler(({ context }) => symbols.listSymbols(context.actor));

export const getSymbolFn = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => symbols.getSymbol(context.actor, { id: data.id }));

export const createSymbolFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => symbols.createSymbolInput.parse(d))
  .handler(({ data, context }) => symbols.createSymbol(context.actor, data));

export const deleteSymbolFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => symbols.deleteSymbol(context.actor, { id: data.id }));

export const importBarsFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), csv: z.string().max(5_000_000) }).strict().parse(d))
  .handler(({ data, context }) => symbols.importCsv(context.actor, { id: data.id }, data.csv));

export const getBarsFn = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), interval: symbols.intervalSchema }).strict().parse(d))
  .handler(({ data, context }) => symbols.chartData(context.actor, data.id, data.interval));

export const runScreenFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => screener.runScreenInput.parse(d))
  .handler(({ data, context }) => screener.runScreen(context.actor, data));

export const listScreensFn = createServerFn()
  .middleware([actorMiddleware])
  .handler(({ context }) => screener.listScreens(context.actor));

export const saveScreenFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => screener.saveScreenInput.parse(d))
  .handler(({ data, context }) => screener.saveScreen(context.actor, data));

export const deleteScreenFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => screener.deleteScreen(context.actor, data.id));
