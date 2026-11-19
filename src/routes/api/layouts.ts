import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as layouts from "@/server/layouts";

export const Route = createFileRoute("/api/layouts")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ layouts: await layouts.listLayouts(actor) })),
      POST: json(
        async (actor, { request }) => ({ layout: await layouts.saveLayout(actor, layouts.saveLayoutInput.parse(await body(request))) }),
        201,
      ),
    },
  },
});
