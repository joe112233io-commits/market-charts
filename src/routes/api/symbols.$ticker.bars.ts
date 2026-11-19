import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/server/api";
import * as symbols from "@/server/symbols";

export const Route = createFileRoute("/api/symbols/$ticker/bars")({
  server: {
    handlers: {
      // ?interval=intraday|1D|1W|1M (default 1D)
      GET: json(async (actor, { params, request }) => {
        const interval = symbols.intervalSchema.parse(new URL(request.url).searchParams.get("interval") ?? "1D");
        return { bars: await symbols.getBars(actor, { ticker: params.ticker }, interval) };
      }),
      // A CSV body: date or datetime, open, high, low, close, volume.
      POST: json(async (actor, { params, request }) => symbols.importCsv(actor, { ticker: params.ticker }, await request.text())),
    },
  },
});
