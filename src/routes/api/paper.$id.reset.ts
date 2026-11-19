import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as paper from "@/server/paper";

export const Route = createFileRoute("/api/paper/$id/reset")({
  server: {
    handlers: {
      POST: json(async (actor, { params }) => paper.resetAccount(actor, params.id)),
    },
  },
});
