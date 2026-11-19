import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as screener from "@/server/screener";

export const Route = createFileRoute("/api/screens")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ screens: await screener.listScreens(actor) })),
      POST: json(
        async (actor, { request }) => ({ screen: await screener.saveScreen(actor, screener.saveScreenInput.parse(await body(request))) }),
        201,
      ),
    },
  },
});
