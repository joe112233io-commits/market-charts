import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as screener from "@/server/screener";

export const Route = createFileRoute("/api/screens/$id")({
  server: {
    handlers: {
      GET: json(async (actor, { params }) => ({ screen: await screener.getScreen(actor, params.id) })),
      DELETE: json(async (actor, { params }) => screener.deleteScreen(actor, params.id)),
    },
  },
});
