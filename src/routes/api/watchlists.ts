import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as watchlists from "@/server/watchlists";

export const Route = createFileRoute("/api/watchlists")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ watchlists: await watchlists.listWatchlists(actor) })),
      POST: json(
        async (actor, { request }) => ({
          watchlist: await watchlists.createWatchlist(actor, watchlists.nameInput.parse(await body(request))),
        }),
        201,
      ),
    },
  },
});
