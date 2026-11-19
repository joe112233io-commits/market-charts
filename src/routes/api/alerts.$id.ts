import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as alerts from "@/server/alerts";

export const Route = createFileRoute("/api/alerts/$id")({
  server: {
    handlers: {
      GET: json(async (actor, { params }) => ({ alert: await alerts.getAlert(actor, params.id) })),
      DELETE: json(async (actor, { params }) => alerts.deleteAlert(actor, params.id)),
    },
  },
});
