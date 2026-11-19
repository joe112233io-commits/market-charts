import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { actorFor } from "@/server/users";

/** The signed-in member as an `actor` (recorded on first sight), for every query. */
export const actorMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => next({ context: { actor: await actorFor(context.user) } }));
