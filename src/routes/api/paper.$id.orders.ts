import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as paper from "@/server/paper";

export const Route = createFileRoute("/api/paper/$id/orders")({
  server: {
    handlers: {
      POST: json(
        async (actor, { params, request }) => ({
          order: await paper.placeOrder(actor, params.id, paper.placeOrderInput.parse(await body(request))),
        }),
        201,
      ),
    },
  },
});
