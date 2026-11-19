import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { refreshDailyBars } from "./server/marketData";
import { tools } from "./tools";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401), and serves the tools.
export default {
  ...everyApp<Env>(async (request) => tanstackEntry.fetch(request), {
    tools,
  }),
  // The daily market-data fetch (cloudflare.config.ts). It does nothing until
  // MARKET_DATA_API_KEY is set.
  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshDailyBars());
  },
};
