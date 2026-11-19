import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as watchlists from "@/server/watchlists";

export const Route = createFileRoute("/api/watchlists/$id")({
  server: {
    handlers: {
      GET: json(async (actor, { params }) => watchlists.getWatchlist(actor, params.id)),
      DELETE: json(async (actor, { params }) => watchlists.deleteWatchlist(actor, params.id)),
    },
  },
});
