import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as screener from "@/server/screener";

export const Route = createFileRoute("/api/screener")({
  server: {
    handlers: {
      // Filters, sort, dir, page and pageSize as query parameters.
      GET: json(async (actor, { request }) => {
        const q = Object.fromEntries(new URL(request.url).searchParams);
        const { sort, dir, page, pageSize, ...filters } = q;
        return screener.runScreen(actor, screener.runScreenInput.parse({ filters, sort, dir, page, pageSize }));
      }),
    },
  },
});
