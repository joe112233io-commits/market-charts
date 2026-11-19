// Authorization: private paths, owner-only objects, admin-only deletes, no sign-in of the app's own.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { api, ok, toCsv, dailyBars } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/watchlists", "/alerts", "/paper", "/screener", "/layouts", "/api/symbols", "/api/alerts"]);

  for (const path of ["/api/symbols", "/api/alerts", "/api/screener", "/chart", "/health"]) {
    expect((await runtime.fetch(path)).status).not.toBe(200);
    expect((await runtime.fetch(path, { role: "outsider" })).status).not.toBe(200);
  }
  const anonPost = await runtime.fetch("/api/symbols", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: "HACK", name: "x", exchange: "x", assetType: "stock", currency: "USD" }) });
  expect(anonPost.status).not.toBe(201);

  // The app serves no sign-in of its own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/register", "/logout", "/auth/login"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).not.toBe(200);
  }
  const home = await (await runtime.fetch("/", { role: "member" })).text();
  expect(home).not.toMatch(/type="password"/i);

  // Shared symbols: only an admin or the creator deletes.
  await ok(runtime, "owner", "/api/symbols", { method: "POST", json: { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", assetType: "stock", currency: "USD" } }, 201);
  await ok(runtime, "owner", "/api/symbols/AAPL/bars", { method: "POST", csv: toCsv(dailyBars({ open: 190, count: 40 })) });
  expect((await api(runtime, "member", "/api/symbols/AAPL", { method: "DELETE" })).status).toBe(403);
  expect((await ok(runtime, "member", "/api/symbols/AAPL")).symbol.ticker).toBe("AAPL");
  await ok(runtime, "member", "/api/symbols", { method: "POST", json: { ticker: "ETHUSD", name: "Ether / US Dollar", exchange: "COINBASE", assetType: "crypto", currency: "USD" } }, 201);
  await ok(runtime, "member", "/api/symbols", { method: "POST", json: { ticker: "EURUSD", name: "Euro / US Dollar", exchange: "FX", assetType: "forex", currency: "USD" } }, 201);
  await ok(runtime, "member", "/api/symbols/ETHUSD", { method: "DELETE" });
  await ok(runtime, "owner", "/api/symbols/EURUSD", { method: "DELETE" });
  expect((await api(runtime, "member", "/api/symbols/EURUSD")).status).toBe(404);

  // The delete button is shown only to those allowed.
  const memberCtx = await runtime.context("member");
  const mp = await memberCtx.newPage();
  const aaplId = (await ok(runtime, "member", "/api/symbols/AAPL")).symbol.id;
  await mp.goto(`/symbols/${aaplId}`);
  await expect(mp.getByRole("heading", { name: /AAPL/ })).toBeVisible();
  await expect(mp.getByRole("button", { name: "Delete symbol" })).toHaveCount(0);

  // Private objects belong to their owner.
  const wl = (await ok(runtime, "owner", "/api/watchlists", { method: "POST", json: { name: "Owner picks" } }, 201)).watchlist;
  await ok(runtime, "owner", `/api/watchlists/${wl.id}/items`, { method: "POST", json: { ticker: "AAPL" } }, 201);
  const alert = (await ok(runtime, "owner", "/api/alerts", { method: "POST", json: { ticker: "AAPL", condition: "less_than", value: 1, frequency: "once", message: "Owner alert" } }, 201)).alert;
  const layout = (await ok(runtime, "owner", "/api/layouts", { method: "POST", json: { name: "Owner layout", symbolId: aaplId, interval: "1D", chartType: "candles", indicators: [], drawings: [] } }, 201)).layout;
  const acct = (await ok(runtime, "owner", "/api/paper", { method: "POST", json: { name: "Owner account", startingBalance: 10000, currency: "USD", commissionPct: 0 } }, 201)).account;
  const screen = (await ok(runtime, "owner", "/api/screens", { method: "POST", json: { name: "Owner screen", filters: { assetType: "stock" } } }, 201)).screen;

  for (const path of [`/api/watchlists/${wl.id}`, `/api/alerts/${alert.id}`, `/api/layouts/${layout.id}`, `/api/paper/${acct.id}`, `/api/screens/${screen.id}`]) {
    expect((await api(runtime, "member", path)).status).toBe(404);
    expect((await api(runtime, "owner", path)).status).toBe(200);
  }
  expect((await api(runtime, "member", `/api/watchlists/${wl.id}/items`, { method: "POST", json: { ticker: "AAPL" } })).status).toBe(404);
  expect((await api(runtime, "member", `/api/alerts/${alert.id}`, { method: "DELETE" })).status).toBe(404);
  expect((await api(runtime, "member", `/api/layouts/${layout.id}`, { method: "DELETE" })).status).toBe(404);
  expect((await api(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "AAPL", side: "buy", type: "market", qty: 1 } })).status).toBe(404);
  expect((await api(runtime, "member", `/api/paper/${acct.id}/reset`, { method: "POST" })).status).toBe(404);
  expect((await api(runtime, "owner", `/api/alerts/${alert.id}`)).status).toBe(200);
  expect((await ok(runtime, "member", "/api/alerts")).alerts.length).toBe(0);
  expect((await ok(runtime, "member", "/api/watchlists")).watchlists.length).toBe(0);
  expect((await ok(runtime, "member", "/api/alerts/log")).events.length).toBe(0);

  // An owner's alert firing never shows up in another member's log.
  await ok(runtime, "member", "/api/alerts", { method: "POST", json: { ticker: "AAPL", condition: "less_than", value: 1, frequency: "once", message: "Member alert" } }, 201);
  await ok(runtime, "owner", "/api/symbols/AAPL/bars", { method: "POST", csv: "date,open,high,low,close,volume\n2026-06-01,0.5,0.6,0.4,0.5,100" });
  const memberLog = (await ok(runtime, "member", "/api/alerts/log")).events;
  expect(memberLog.map((e) => e.message)).toEqual(["Member alert"]);
  expect((await ok(runtime, "owner", "/api/alerts/log")).events.map((e) => e.message)).toEqual(["Owner alert"]);

  // Pages for another member's objects show not found.
  await mp.goto(`/watchlists/${wl.id}`);
  await expect(mp.getByText("Owner picks")).toHaveCount(0);
  await expect(mp.getByTestId("not-found")).toBeVisible();
  await mp.goto(`/paper/${acct.id}`);
  await expect(mp.getByText("Owner account")).toHaveCount(0);
  await expect(mp.getByTestId("not-found")).toBeVisible();
  await mp.goto(`/chart?layout=${layout.id}`);
  await expect(mp.getByText("Owner layout")).toHaveCount(0);
  await memberCtx.close();
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
