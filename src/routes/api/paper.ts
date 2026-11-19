import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as paper from "@/server/paper";

export const Route = createFileRoute("/api/paper")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ accounts: await paper.listAccounts(actor) })),
      POST: json(
        async (actor, { request }) => ({ account: await paper.createAccount(actor, paper.createAccountInput.parse(await body(request))) }),
        201,
      ),
    },
  },
});
