import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as watchlists from "@/server/watchlists";
import * as layouts from "@/server/layouts";
import { actorMiddleware } from "./middleware";

const idInput = z.object({ id: z.string() }).strict();

export const listWatchlistsFn = createServerFn()
  .middleware([actorMiddleware])
  .handler(({ context }) => watchlists.listWatchlists(context.actor));

export const getWatchlistFn = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => watchlists.getWatchlist(context.actor, data.id));

export const createWatchlistFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => watchlists.nameInput.parse(d))
  .handler(({ data, context }) => watchlists.createWatchlist(context.actor, data));

export const renameWatchlistFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), name: z.string() }).strict().parse(d))
  .handler(({ data, context }) => watchlists.renameWatchlist(context.actor, data.id, watchlists.nameInput.parse({ name: data.name })));

export const deleteWatchlistFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => watchlists.deleteWatchlist(context.actor, data.id));

export const addItemFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), symbolId: z.string() }).strict().parse(d))
  .handler(({ data, context }) => watchlists.addItem(context.actor, data.id, { symbolId: data.symbolId }));

export const removeItemFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), symbolId: z.string() }).strict().parse(d))
  .handler(({ data, context }) => watchlists.removeItem(context.actor, data.id, data.symbolId));

export const reorderItemsFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ id: z.string(), symbolIds: z.array(z.string()).max(1000) }).strict().parse(d))
  .handler(({ data, context }) => watchlists.reorderItems(context.actor, data.id, data.symbolIds));

export const listLayoutsFn = createServerFn()
  .middleware([actorMiddleware])
  .handler(({ context }) => layouts.listLayouts(context.actor));

export const getLayoutFn = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => layouts.getLayout(context.actor, data.id));

export const saveLayoutFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => layouts.saveLayoutInput.parse(d))
  .handler(({ data, context }) => layouts.saveLayout(context.actor, data));

export const updateLayoutFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => layouts.updateLayoutInput.parse(d))
  .handler(({ data, context }) => layouts.updateLayout(context.actor, data));

export const renameLayoutFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => layouts.renameLayoutInput.parse(d))
  .handler(({ data, context }) => layouts.renameLayout(context.actor, data));

export const deleteLayoutFn = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => layouts.deleteLayout(context.actor, data.id));
