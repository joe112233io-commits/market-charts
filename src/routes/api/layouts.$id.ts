import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as layouts from "@/server/layouts";

export const Route = createFileRoute("/api/layouts/$id")({
  server: {
    handlers: {
      GET: json(async (actor, { params }) => ({ layout: await layouts.getLayout(actor, params.id) })),
      DELETE: json(async (actor, { params }) => layouts.deleteLayout(actor, params.id)),
    },
  },
});
