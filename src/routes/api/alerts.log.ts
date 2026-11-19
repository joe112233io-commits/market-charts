import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as alerts from "@/server/alerts";

export const Route = createFileRoute("/api/alerts/log")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ events: await alerts.listEvents(actor) })),
    },
  },
});
