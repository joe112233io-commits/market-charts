import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as watchlists from "@/server/watchlists";

export const Route = createFileRoute("/api/watchlists/$id/items")({
  server: {
    handlers: {
      POST: json(
        async (actor, { params, request }) => ({
          item: await watchlists.addItem(actor, params.id, watchlists.addItemInput.parse(await body(request))),
        }),
        201,
      ),
    },
  },
});
