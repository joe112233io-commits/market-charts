import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { users } from "@/db/schema";

/** The caller as every query sees them. */
export interface Actor {
  id: string;
  orgId: string;
  admin: boolean;
}

/** Records the person on first sight (and keeps their email current). */
export async function actorFor(user: EveryAppUser): Promise<Actor> {
  await db
    .insert(users)
    .values({ id: user.id, orgId: user.orgId, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  return { id: user.id, orgId: user.orgId, admin: isAdmin(user) };
}

/** A failure the caller may read; `status` is the HTTP status for the JSON API. */
export class AppError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(what: string): never {
  throw new AppError(404, `${what} not found`);
}
