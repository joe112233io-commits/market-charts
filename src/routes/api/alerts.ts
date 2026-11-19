import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as alerts from "@/server/alerts";

export const Route = createFileRoute("/api/alerts")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ alerts: await alerts.listAlerts(actor) })),
      POST: json(
        async (actor, { request }) => ({ alert: await alerts.createAlert(actor, alerts.createAlertInput.parse(await body(request))) }),
        201,
      ),
    },
  },
});
