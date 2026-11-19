// The app's tools for AI clients, served by the Gateway at /mcp. Each calls
// the same queries as the pages, as the member the Gateway names.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import * as alerts from "@/server/alerts";
import * as symbols from "@/server/symbols";
import { actorFor, AppError } from "@/server/users";

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw new ToolError(error.message);
    throw error;
  }
}

export const tools = defineTools(
  {
    list_symbols: {
      description: "List the symbols in the catalogue with their last price, change and volume.",
      risk: "read",
      input: z.object({}).strict(),
      handler: async (_input, { user }) => run(async () => symbols.listSymbols(await actorFor(user))),
    },
    get_bars: {
      description: "Get a symbol's OHLCV bars by ticker. interval is intraday, 1D, 1W or 1M.",
      risk: "read",
      input: z.object({ ticker: z.string(), interval: symbols.intervalSchema.default("1D") }).strict(),
      handler: async (input, { user }) =>
        run(async () => (await symbols.getBars(await actorFor(user), { ticker: input.ticker }, input.interval)).slice(-300)),
    },
    list_alerts: {
      description: "List the caller's price alerts and their status.",
      risk: "read",
      input: z.object({}).strict(),
      handler: async (_input, { user }) => run(async () => alerts.listAlerts(await actorFor(user))),
    },
    create_alert: {
      description: "Create a price alert on a symbol for the caller.",
      risk: "write",
      idempotent: false,
      input: alerts.createAlertInput,
      handler: async (input, { user }) => run(async () => alerts.createAlert(await actorFor(user), input)),
    },
  },
  { instructions: "Call list_symbols first to find tickers." },
);
