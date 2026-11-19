// Persistence: what members write survives a restart of the Workers.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { ok, toCsv, dailyBars } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const sym = (await ok(runtime, "owner", "/api/symbols", { method: "POST", json: { ticker: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", assetType: "stock", currency: "USD" } }, 201)).symbol;
  const bars = dailyBars({ open: 410, count: 120, seed: 3 });
  await ok(runtime, "owner", "/api/symbols/MSFT/bars", { method: "POST", csv: toCsv(bars) });
  const wl = (await ok(runtime, "member", "/api/watchlists", { method: "POST", json: { name: "Cloud names" } }, 201)).watchlist;
  await ok(runtime, "member", `/api/watchlists/${wl.id}/items`, { method: "POST", json: { ticker: "MSFT" } }, 201);
  const alert = (await ok(runtime, "member", "/api/alerts", { method: "POST", json: { ticker: "MSFT", condition: "crossing_down", value: 380, frequency: "once", message: "MSFT lost 380" } }, 201)).alert;
  const layout = (await ok(runtime, "member", "/api/layouts", { method: "POST", json: { name: "MSFT daily", symbolId: sym.id, interval: "1D", chartType: "line", indicators: [{ id: "a", type: "ema", params: { period: 21 } }], drawings: [{ id: "d1", kind: "horizontal", points: [{ time: 1735776000, price: 400 }] }] } }, 201)).layout;
  const acct = (await ok(runtime, "member", "/api/paper", { method: "POST", json: { name: "Long only", startingBalance: 25000, currency: "USD", commissionPct: 0 } }, 201)).account;
  await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "MSFT", side: "buy", type: "market", qty: 3 } }, 201);
  const screen = (await ok(runtime, "member", "/api/screens", { method: "POST", json: { name: "Above trend", filters: { sma50: "above" } } }, 201)).screen;

  await runtime.restart();

  expect((await ok(runtime, "member", "/api/symbols/MSFT/bars?interval=1D")).bars.length).toBe(120);
  expect((await ok(runtime, "member", `/api/watchlists/${wl.id}`)).items.map((i) => i.ticker)).toEqual(["MSFT"]);
  expect((await ok(runtime, "member", `/api/alerts/${alert.id}`)).alert.message).toBe("MSFT lost 380");
  const l = (await ok(runtime, "member", `/api/layouts/${layout.id}`)).layout;
  expect(l.chartType).toBe("line");
  expect(l.indicators[0].params.period).toBe(21);
  expect(l.drawings[0].kind).toBe("horizontal");
  const p = await ok(runtime, "member", `/api/paper/${acct.id}`);
  expect(p.positions[0].qty).toBe(3);
  expect(p.account.cash).toBeCloseTo(25000 - 3 * bars.at(-1).close, 2);
  expect((await ok(runtime, "member", `/api/screens/${screen.id}`)).screen.filters.sma50).toBe("above");

  const page = await (await runtime.context("member")).newPage();
  await page.goto(`/watchlists/${wl.id}`);
  await expect(page.getByTestId("watch-row-MSFT")).toBeVisible();
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
