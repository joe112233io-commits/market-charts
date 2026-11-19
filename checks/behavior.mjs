// Behavior: every frozen feature's main path, through the packaged release.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { api, ok, seedMarket, toCsv, pick, nextWeekday } from "./lib.mjs";

const runtime = await startRuntime();
try {
  // ---------- F001: symbols and price history (request level) ----------
  const market = await seedMarket(runtime, "owner");
  const aapl = market.AAPL;
  const last = aapl.bars.at(-1);
  const prev = aapl.bars.at(-2);

  const dup = await api(runtime, "member", "/api/symbols", { method: "POST", json: { ticker: "aapl", name: "Again", exchange: "NASDAQ", assetType: "stock", currency: "USD" } });
  expect(dup.status).toBe(409);

  const badType = await api(runtime, "member", "/api/symbols", { method: "POST", json: { ticker: "XYZ", name: "X", exchange: "X", assetType: "bond", currency: "USD" } });
  expect(badType.status).toBe(400);

  const quote = (await ok(runtime, "member", "/api/symbols/AAPL")).symbol;
  expect(quote.last).toBeCloseTo(last.close, 4);
  expect(quote.change).toBeCloseTo(last.close - prev.close, 4);
  expect(quote.changePct).toBeCloseTo(((last.close - prev.close) / prev.close) * 100, 3);
  expect(quote.firstTime.slice(0, 10)).toBe(aapl.bars[0].date);
  expect(quote.lastTime.slice(0, 10)).toBe(last.date);
  expect(quote.hasIntraday).toBe(false);

  // Re-import: one changed row updates, invalid rows are reported and skipped.
  const changed = { ...aapl.bars[10], close: +(aapl.bars[10].close + 0.5).toFixed(2), high: +(aapl.bars[10].high + 1).toFixed(2) };
  const reimport = await ok(runtime, "member", "/api/symbols/AAPL/bars", {
    method: "POST",
    csv: [
      "Date,Open,High,Low,Close,Volume",
      `${changed.date},${changed.open},${changed.high},${changed.low},${changed.close},${changed.volume}`,
      "2025-02-30,1,2,0.5,1.5,100",
      `${aapl.bars[12].date},10,9,8,9.5,100`,
      `${aapl.bars[13].date},abc,2,1,1.5,100`,
    ].join("\n"),
  });
  expect(reimport.added).toBe(0);
  expect(reimport.updated).toBe(1);
  expect(reimport.skipped).toBe(3);
  expect(reimport.errors.map((e) => e.row)).toEqual([3, 4, 5]);

  // F002 intervals: weekly and monthly are built from daily bars.
  const daily = (await ok(runtime, "member", "/api/symbols/AAPL/bars?interval=1D")).bars;
  expect(daily.length).toBe(260);
  const weekly = (await ok(runtime, "member", "/api/symbols/AAPL/bars?interval=1W")).bars;
  const monthly = (await ok(runtime, "member", "/api/symbols/AAPL/bars?interval=1M")).bars;
  expect(weekly.length).toBeGreaterThan(50);
  expect(weekly.length).toBeLessThan(56);
  expect(monthly.length).toBe(12);
  const jan = aapl.bars.filter((b) => b.date.startsWith("2025-01"));
  expect(monthly[0].open).toBeCloseTo(jan[0].open, 4);
  expect(monthly[0].close).toBeCloseTo(jan.at(-1).close, 4);
  expect(monthly[0].high).toBeCloseTo(Math.max(...jan.map((b) => b.high)), 4);
  expect(monthly[0].volume).toBe(jan.reduce((s, b) => s + b.volume, 0));

  // Intraday data is offered once it exists.
  await ok(runtime, "owner", "/api/symbols/MSFT/bars", {
    method: "POST",
    csv: "datetime,open,high,low,close,volume\n2026-01-05T14:30:00Z,400,401,399.5,400.5,12000\n2026-01-05T14:35:00Z,400.5,402,400,401.8,15000",
  });
  expect((await ok(runtime, "member", "/api/symbols/MSFT")).symbol.hasIntraday).toBe(true);
  expect((await ok(runtime, "member", "/api/symbols/MSFT/bars?interval=intraday")).bars.length).toBe(2);

  // ---------- F004 + F005 at request level: new bars drive alerts and fills ----------
  const alert = (await ok(runtime, "member", "/api/alerts", { method: "POST", json: { ticker: "SPY", condition: "greater_than", value: 1, frequency: "once", message: "SPY is up" } }, 201)).alert;
  const perBar = (await ok(runtime, "member", "/api/alerts", { method: "POST", json: { ticker: "SPY", condition: "greater_than", value: 1, frequency: "once_per_bar", message: "every bar" } }, 201)).alert;
  const expired = (await ok(runtime, "member", "/api/alerts", { method: "POST", json: { ticker: "SPY", condition: "greater_than", value: 1, frequency: "once", message: "late", expiresAt: "2020-01-01T00:00:00Z" } }, 201)).alert;
  const channel = await api(runtime, "member", "/api/alerts", { method: "POST", json: { ticker: "SPY", condition: "entering_channel", value: 500, frequency: "once", message: "x" } });
  expect(channel.status).toBe(400);

  const spyBars = market.SPY.bars;
  let day = spyBars.at(-1).date;
  const spyClose = spyBars.at(-1).close;
  const acct = (await ok(runtime, "member", "/api/paper", { method: "POST", json: { name: "Swing practice", startingBalance: 100000, currency: "USD", commissionPct: 0.1 } }, 201)).account;
  const mkt = (await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "SPY", side: "buy", type: "market", qty: 10 } }, 201)).order;
  expect(mkt.status).toBe("filled");
  expect(mkt.filledPrice).toBeCloseTo(spyClose, 4);
  const limit = (await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "SPY", side: "buy", type: "limit", qty: 5, price: +(spyClose - 5).toFixed(2) } }, 201)).order;
  expect(limit.status).toBe("working");
  const stop = (await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "SPY", side: "sell", type: "stop", qty: 4, price: +(spyClose - 50).toFixed(2) } }, 201)).order;
  expect(stop.status).toBe("working");
  const tooBig = (await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "SPY", side: "buy", type: "market", qty: 100000 } }, 201)).order;
  expect(tooBig.status).toBe("rejected");
  const oversell = (await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "SPY", side: "sell", type: "market", qty: 11 } }, 201)).order;
  expect(oversell.status).toBe("rejected");

  // A new bar that dips through the limit price: the limit fills, the stop doesn't.
  day = nextWeekday(day);
  const nb = { date: day, open: spyClose, high: +(spyClose + 2).toFixed(2), low: +(spyClose - 6).toFixed(2), close: +(spyClose + 1).toFixed(2), volume: 2500000 };
  const imp = await ok(runtime, "owner", "/api/symbols/SPY/bars", { method: "POST", csv: toCsv([nb]) });
  expect(imp.added).toBe(1);

  const alerts = (await ok(runtime, "member", "/api/alerts")).alerts;
  expect(alerts.find((a) => a.id === alert.id).status).toBe("triggered");
  expect(alerts.find((a) => a.id === perBar.id).status).toBe("active");
  expect(alerts.find((a) => a.id === expired.id).status).toBe("expired");
  const log = (await ok(runtime, "member", "/api/alerts/log")).events;
  expect(log.filter((e) => e.alertId === alert.id).length).toBe(1);
  expect(log.filter((e) => e.alertId === perBar.id).length).toBe(1);
  expect(log.filter((e) => e.alertId === expired.id).length).toBe(0);

  // The same bar again is an update, not a new bar: nothing fires twice.
  await ok(runtime, "owner", "/api/symbols/SPY/bars", { method: "POST", csv: toCsv([nb]) });
  expect((await ok(runtime, "member", "/api/alerts/log")).events.filter((e) => e.alertId === perBar.id).length).toBe(1);
  day = nextWeekday(day);
  await ok(runtime, "owner", "/api/symbols/SPY/bars", { method: "POST", csv: toCsv([{ ...nb, date: day }]) });
  const log2 = (await ok(runtime, "member", "/api/alerts/log")).events;
  expect(log2.filter((e) => e.alertId === perBar.id).length).toBe(2);
  expect(log2.filter((e) => e.alertId === alert.id).length).toBe(1);

  let paper = await ok(runtime, "member", `/api/paper/${acct.id}`);
  const filledLimit = paper.orders.find((o) => o.id === limit.id);
  expect(filledLimit.status).toBe("filled");
  expect(filledLimit.filledPrice).toBeCloseTo(+(spyClose - 5).toFixed(2), 4);
  expect(paper.orders.find((o) => o.id === stop.id).status).toBe("working");
  const pos = paper.positions.find((p) => p.ticker === "SPY");
  expect(pos.qty).toBe(15);
  const commission = (10 * spyClose + 5 * (spyClose - 5)) * 0.001;
  expect(paper.account.cash).toBeCloseTo(100000 - 10 * spyClose - 5 * +(spyClose - 5).toFixed(2) - commission, 2);
  const cancel = await ok(runtime, "member", `/api/paper/${acct.id}/orders/${stop.id}/cancel`, { method: "POST" });
  expect(cancel.order.status).toBe("cancelled");
  const sell = (await ok(runtime, "member", `/api/paper/${acct.id}/orders`, { method: "POST", json: { ticker: "SPY", side: "sell", type: "market", qty: 5 } }, 201)).order;
  expect(sell.status).toBe("filled");
  paper = await ok(runtime, "member", `/api/paper/${acct.id}`);
  expect(paper.positions.find((p) => p.ticker === "SPY").qty).toBe(10);
  expect(Math.abs(paper.summary.realizedPnl)).toBeGreaterThan(0);
  expect(paper.summary.equity).toBeCloseTo(paper.account.cash + paper.summary.marketValue, 2);
  await ok(runtime, "member", `/api/paper/${acct.id}/reset`, { method: "POST" });
  paper = await ok(runtime, "member", `/api/paper/${acct.id}`);
  expect(paper.account.cash).toBe(100000);
  expect(paper.positions.length).toBe(0);
  expect(paper.orders.length).toBe(0);

  // ---------- F006: screener at request level ----------
  const screen = await ok(runtime, "member", "/api/screener?assetType=stock&sort=changePct&dir=desc");
  expect(screen.rows.map((r) => r.ticker).sort()).toEqual(["AAPL", "MSFT"]);
  expect(screen.rows[0].changePct).toBeGreaterThanOrEqual(screen.rows[1].changePct);
  expect(typeof screen.rows[0].rsi14).toBe("number");
  const above = await ok(runtime, "member", "/api/screener?minPrice=1000");
  expect(above.rows.map((r) => r.ticker)).toEqual(["BTCUSD"]);

  // ---------- Browser journey (owner) ----------
  const ctx = await runtime.context("owner");
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Symbols" })).toBeVisible();
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("symbol-row-AAPL")).toBeVisible();

  // F001: add a symbol and paste bars into it.
  await page.getByRole("button", { name: "Add symbol" }).click();
  await page.getByLabel("Ticker", { exact: true }).fill("NVDA");
  await page.getByLabel("Name", { exact: true }).fill("NVIDIA Corp.");
  await page.getByLabel("Exchange", { exact: true }).fill("NASDAQ");
  await pick(page, "asset-type", "Stock");
  await page.getByLabel("Currency", { exact: true }).fill("USD");
  await Promise.all([page.waitForURL(/\/symbols\//), page.getByRole("button", { name: "Add", exact: true }).click()]);
  await expect(page.getByRole("heading", { name: /NVDA/ })).toBeVisible();
  await page.getByLabel("CSV", { exact: true }).fill("date,open,high,low,close,volume\n2025-12-29,186.5,189.2,185.9,188.4,152000000\n2025-12-30,188.4,190.1,187.0,187.6,148000000\n2025-12-31,187.6,192.3,187.1,191.9,171000000\n2025-13-01,1,1,1,1,1");
  await page.getByRole("button", { name: "Import bars" }).click();
  await expect(page.getByTestId("import-result")).toContainText("3 added");
  await expect(page.getByTestId("import-result")).toContainText("1 skipped");
  await expect(page.getByTestId("quote-last")).toHaveText("191.90");
  await expect(page.getByTestId("quote-change-pct")).toContainText("+2.29%");

  // F003: a watchlist with ordering, sorting and no duplicates.
  await page.getByRole("link", { name: "Watchlists" }).click();
  await page.getByRole("button", { name: "New watchlist" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Core holdings");
  await Promise.all([page.waitForURL(/\/watchlists\/.+/), page.getByRole("button", { name: "Create" }).click()]);
  for (const t of ["AAPL", "MSFT", "SPY", "BTCUSD"]) {
    await pick(page, "add-symbol-select", t);
    await page.getByRole("button", { name: "Add to list" }).click();
    await expect(page.getByTestId(`watch-row-${t}`)).toBeVisible();
  }
  const watchId = page.url().split("/watchlists/")[1];
  const dupItem = await api(runtime, "owner", `/api/watchlists/${watchId}/items`, { method: "POST", json: { ticker: "AAPL" } });
  expect(dupItem.status).toBe(409);
  await expect(page.getByTestId("watch-row-AAPL").getByTestId("watch-last")).toHaveText(last.close.toFixed(2));
  await page.getByRole("button", { name: "Move BTCUSD up" }).click();
  await expect(page.locator("[data-testid^=watch-row-]").nth(2)).toHaveAttribute("data-testid", "watch-row-BTCUSD");
  await page.reload();
  await expect(page.locator("[data-testid^=watch-row-]").nth(2)).toHaveAttribute("data-testid", "watch-row-BTCUSD");
  await page.getByRole("button", { name: "Remove SPY" }).click();
  await expect(page.getByTestId("watch-row-SPY")).toHaveCount(0);
  await page.getByRole("button", { name: "Sort by Last" }).click();
  await page.getByRole("button", { name: "Sort by Last" }).click();
  await expect(page.locator("[data-testid^=watch-row-]").first()).toHaveAttribute("data-testid", "watch-row-BTCUSD");

  // F004: an alert made on the page fires when a new bar arrives.
  await page.getByRole("link", { name: "Alerts" }).click();
  await page.getByRole("button", { name: "New alert" }).click();
  await pick(page, "alert-symbol", "AAPL");
  await pick(page, "alert-condition", "Crossing up");
  const level = +(last.close + 3).toFixed(2);
  await page.getByLabel("Value", { exact: true }).fill(String(level));
  await page.getByLabel("Message", { exact: true }).fill("AAPL broke out above resistance");
  await page.getByRole("button", { name: "Create alert" }).click();
  const row = page.getByTestId("alert-row").filter({ hasText: "AAPL broke out" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(row).toContainText("Paused");
  await row.getByRole("button", { name: "Resume" }).click();
  await expect(row).toContainText("Active");
  const aaplNext = nextWeekday(last.date);
  await ok(runtime, "owner", "/api/symbols/AAPL/bars", { method: "POST", csv: toCsv([{ date: aaplNext, open: last.close, high: level + 1, low: last.close - 1, close: level + 0.5, volume: 900000 }]) });
  await page.reload();
  await page.getByRole("tab", { name: "Triggered" }).click();
  await expect(page.getByTestId("alert-row").filter({ hasText: "AAPL broke out" })).toBeVisible();
  await page.getByRole("tab", { name: "Log" }).click();
  await expect(page.getByTestId("alert-event").filter({ hasText: "AAPL broke out above resistance" })).toBeVisible();

  // F005: a paper account in the browser.
  await page.getByRole("link", { name: "Paper trading" }).click();
  await page.getByRole("button", { name: "New account" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Growth portfolio");
  await page.getByLabel("Starting balance", { exact: true }).fill("50000");
  await page.getByLabel("Commission %", { exact: true }).fill("0.05");
  await Promise.all([page.waitForURL(/\/paper\/.+/), page.getByRole("button", { name: "Open account" }).click()]);
  await pick(page, "order-symbol", "MSFT");
  await page.getByLabel("Quantity", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByTestId("position-row-MSFT")).toBeVisible();
  await expect(page.getByTestId("order-row").first()).toContainText("Filled");
  await pick(page, "order-type", "Limit");
  await page.getByLabel("Quantity", { exact: true }).fill("5");
  await page.getByLabel("Price", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByTestId("order-row").filter({ hasText: "Working" })).toHaveCount(1);
  await page.getByTestId("order-row").filter({ hasText: "Working" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("order-row").filter({ hasText: "Cancelled" })).toHaveCount(1);
  await expect(page.getByTestId("acct-equity")).toContainText(/\d/);

  // F006: a saved screen.
  await page.getByRole("link", { name: "Screener" }).click();
  await pick(page, "screen-asset-type", "Stock");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("screen-row-AAPL")).toBeVisible();
  await expect(page.getByTestId("screen-row-BTCUSD")).toHaveCount(0);
  await page.getByRole("button", { name: "Save screen" }).click();
  await page.getByLabel("Name", { exact: true }).fill("US large caps");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/screener");
  await expect(page.getByTestId("screen-row-BTCUSD")).toBeVisible();
  await pick(page, "saved-screens", "US large caps");
  await expect(page.getByTestId("screen-row-BTCUSD")).toHaveCount(0);
  await Promise.all([page.waitForURL(/\/chart/), page.getByTestId("screen-row-AAPL").getByRole("link", { name: "AAPL" }).click()]);

  // F002: the chart, its indicators and drawings, saved as a layout.
  const chart = page.getByTestId("chart");
  await expect(chart).toHaveAttribute("data-symbol", "AAPL");
  await pick(page, "chart-type", "Heikin Ashi");
  await expect(chart).toHaveAttribute("data-type", "heikin_ashi");
  await pick(page, "chart-interval", "1W");
  await expect(chart).toHaveAttribute("data-interval", "1W");
  await pick(page, "chart-interval", "1D");
  await pick(page, "chart-type", "Candles");
  const before = Number(await chart.getAttribute("data-visible"));
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => Number(await chart.getAttribute("data-visible"))).toBeLessThan(before);
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect(page.getByTestId("ohlc-legend")).toContainText("O ");
  await expect(page.getByTestId("ohlc-legend")).toContainText("V ");

  for (const name of ["SMA", "Bollinger Bands", "Volume", "RSI", "MACD"]) {
    await page.getByRole("button", { name: "Indicators" }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  }
  await expect(page.getByTestId("pane-volume")).toBeVisible();
  await expect(page.getByTestId("pane-rsi")).toBeVisible();
  await expect(page.getByTestId("pane-macd")).toBeVisible();
  await page.getByRole("button", { name: "Settings for SMA 20" }).click();
  await page.getByLabel("Period", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("indicator-chip").filter({ hasText: "SMA 50" })).toBeVisible();
  await page.getByRole("button", { name: "Remove MACD 12 26 9" }).click();
  await expect(page.getByTestId("pane-macd")).toHaveCount(0);

  await page.getByRole("button", { name: "Trend line" }).click();
  await chart.click({ position: { x: box.width * 0.3, y: box.height * 0.6 } });
  await chart.click({ position: { x: box.width * 0.7, y: box.height * 0.3 } });
  await page.getByRole("button", { name: "Horizontal line" }).click();
  await chart.click({ position: { x: box.width * 0.5, y: box.height * 0.4 } });
  await page.getByRole("button", { name: "Fibonacci retracement" }).click();
  await chart.click({ position: { x: box.width * 0.2, y: box.height * 0.7 } });
  await chart.click({ position: { x: box.width * 0.45, y: box.height * 0.25 } });
  await page.getByRole("button", { name: "Rectangle" }).click();
  await chart.click({ position: { x: box.width * 0.55, y: box.height * 0.35 } });
  await chart.click({ position: { x: box.width * 0.65, y: box.height * 0.55 } });
  await expect(page.locator("[data-testid=drawing]")).toHaveCount(4);
  await page.locator("[data-testid=drawing][data-kind=rectangle]").click({ force: true });
  await page.getByRole("button", { name: "Delete drawing" }).click();
  await expect(page.locator("[data-testid=drawing]")).toHaveCount(3);

  await page.getByRole("button", { name: "Save layout" }).click();
  await page.getByLabel("Name", { exact: true }).fill("AAPL swing setup");
  await Promise.all([page.waitForURL(/layout=/), page.getByRole("button", { name: "Save", exact: true }).click()]);
  await page.reload();
  await expect(page.getByTestId("chart")).toHaveAttribute("data-symbol", "AAPL");
  await expect(page.getByTestId("indicator-chip").filter({ hasText: "SMA 50" })).toBeVisible();
  await expect(page.locator("[data-testid=drawing]")).toHaveCount(3);

  await page.getByRole("link", { name: "Charts" }).click();
  const layoutRow = page.getByTestId("layout-row").filter({ hasText: "AAPL swing setup" });
  await layoutRow.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Name", { exact: true }).fill("AAPL daily trend");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("layout-row").filter({ hasText: "AAPL daily trend" })).toBeVisible();
  await Promise.all([page.waitForURL(/layout=/), page.getByTestId("layout-row").getByRole("link", { name: "AAPL daily trend" }).click()]);
  await expect(page.locator("[data-testid=drawing]")).toHaveCount(3);
  await expect(page.getByTestId("pane-rsi")).toBeVisible();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.45);
  await runtime.screenshot(page);
  await ctx.close();

  // ---------- Phone-sized smoke ----------
  const phone = await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await p.goto("/");
  await expect(p.getByRole("heading", { name: "Symbols" })).toBeVisible();
  await expect(p.getByTestId("symbol-row-AAPL")).toBeVisible();
  await p.goto(`/chart?symbol=${aapl.id}`);
  await expect(p.getByTestId("chart")).toBeVisible();
  const width = await p.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(400);
  await phone.close();
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
