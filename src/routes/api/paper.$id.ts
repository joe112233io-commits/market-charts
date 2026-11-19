import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as paper from "@/server/paper";

export const Route = createFileRoute("/api/paper/$id")({
  server: {
    handlers: {
      GET: json(async (actor, { params }) => paper.getAccount(actor, params.id)),
      DELETE: json(async (actor, { params }) => paper.deleteAccount(actor, params.id)),
    },
  },
});
