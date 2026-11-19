import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as symbols from "@/server/symbols";

export const Route = createFileRoute("/api/symbols/$ticker")({
  server: {
    handlers: {
      GET: json(async (actor, { params }) => ({ symbol: await symbols.getSymbol(actor, { ticker: params.ticker }) })),
      DELETE: json(async (actor, { params }) => symbols.deleteSymbol(actor, { ticker: params.ticker })),
    },
  },
});
