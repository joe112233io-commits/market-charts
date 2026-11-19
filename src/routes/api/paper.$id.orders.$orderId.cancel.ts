import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as paper from "@/server/paper";

export const Route = createFileRoute("/api/paper/$id/orders/$orderId/cancel")({
  server: {
    handlers: {
      POST: json(async (actor, { params }) => ({ order: await paper.cancelOrder(actor, params.id, params.orderId) })),
    },
  },
});
