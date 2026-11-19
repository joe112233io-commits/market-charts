/// <reference types="vite/client" />

// The bindings come from `cf workers types` (.cloudflare/types).
declare namespace Cloudflare {
  interface Env {
    /** Optional: the market-data provider's key for the daily fetch. */
    MARKET_DATA_API_KEY?: string;
  }
}
