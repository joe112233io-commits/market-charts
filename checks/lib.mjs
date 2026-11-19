// Shared helpers for the release checks: realistic sample prices and API calls.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** A deterministic random walk of weekday daily bars. */
export function dailyBars({ start = "2025-01-02", count = 260, open = 100, seed = 7, drift = 0.0006, vol = 0.016, volume = 1_000_000 }) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const rows = [];
  let price = open;
  const day = new Date(`${start}T00:00:00Z`);
  while (rows.length < count) {
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const o = price;
      const c = +(o * (1 + drift + (rand() - 0.5) * 2 * vol)).toFixed(2);
      const h = +(Math.max(o, c) * (1 + rand() * vol * 0.6)).toFixed(2);
      const l = +(Math.min(o, c) * (1 - rand() * vol * 0.6)).toFixed(2);
      const v = Math.round(volume * (0.6 + rand() * 0.8));
      rows.push({ date: day.toISOString().slice(0, 10), open: +o.toFixed(2), high: h, low: l, close: c, volume: v });
      price = c;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return rows;
}

export function toCsv(rows) {
  return ["date,open,high,low,close,volume", ...rows.map((r) => `${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`)].join("\n");
}

export async function api(runtime, role, path, { method = "GET", json, csv } = {}) {
  const init = { role, method, headers: {} };
  if (json !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(json);
  }
  if (csv !== undefined) {
    init.headers["content-type"] = "text/csv";
    init.body = csv;
  }
  const res = await runtime.fetch(path, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

export async function ok(runtime, role, path, opts, expected = 200) {
  const res = await api(runtime, role, path, opts);
  if (res.status !== expected) console.log(path, res.status, JSON.stringify(res.body).slice(0, 400));
  expect(res.status).toBe(expected);
  return res.body;
}

export const SYMBOLS = [
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", assetType: "stock", currency: "USD", bars: { open: 185, seed: 11 } },
  { ticker: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", assetType: "stock", currency: "USD", bars: { open: 375, seed: 23, volume: 800_000 } },
  { ticker: "BTCUSD", name: "Bitcoin / US Dollar", exchange: "COINBASE", assetType: "crypto", currency: "USD", bars: { open: 42000, seed: 5, vol: 0.03, volume: 25_000 } },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", exchange: "NYSE", assetType: "fund", currency: "USD", bars: { open: 470, seed: 41, vol: 0.008, volume: 3_000_000 } },
];

/** Creates the sample symbols with 260 daily bars each; returns { ticker: { id, bars } }. */
export async function seedMarket(runtime, role = "owner") {
  const out = {};
  for (const s of SYMBOLS) {
    const { bars: barOpts, ...fields } = s;
    const created = await ok(runtime, role, "/api/symbols", { method: "POST", json: fields }, 201);
    const bars = dailyBars(barOpts);
    const result = await ok(runtime, role, `/api/symbols/${s.ticker}/bars`, { method: "POST", csv: toCsv(bars) });
    expect(result.added).toBe(bars.length);
    out[s.ticker] = { id: created.symbol.id, bars };
  }
  return out;
}

/** Picks an option of a Base UI select found by test id. */
export async function pick(page, testId, label) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

export function nextWeekday(date) {
  const d = new Date(`${date}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
