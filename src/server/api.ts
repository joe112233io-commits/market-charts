import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { actorFor, AppError, type Actor } from "@/server/users";

type Ctx = { request: Request; params: Record<string, string> };

/**
 * A JSON endpoint of the app's API, for scripts with a Gateway personal
 * access token. The Gateway admits only members; the caller is read from
 * the identity it sent, and every query below is scoped by it.
 */
export function json(handler: (actor: Actor, ctx: Ctx) => Promise<unknown>, status = 200) {
  return async (ctx: Ctx) => {
    const user = await getEveryAppUser(ctx.request, env);
    if (!user) return Response.json({ error: "Sign in through your Gateway" }, { status: 401 });
    try {
      const actor = await actorFor(user);
      return Response.json(await handler(actor, ctx), { status });
    } catch (error) {
      if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) {
        return Response.json({ error: error.issues.map((i) => i.message).join("; ") }, { status: 400 });
      }
      throw error;
    }
  };
}

export async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "The body must be JSON");
  }
}
