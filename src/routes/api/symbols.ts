import { createFileRoute } from "@tanstack/react-router";
import { body, json } from "@/server/api";
import * as symbols from "@/server/symbols";

export const Route = createFileRoute("/api/symbols")({
  server: {
    handlers: {
      GET: json(async (actor) => ({ symbols: await symbols.listSymbols(actor) })),
      POST: json(
        async (actor, { request }) => ({
          symbol: await symbols.createSymbol(actor, symbols.createSymbolInput.parse(await body(request))),
        }),
        201,
      ),
    },
  },
});
