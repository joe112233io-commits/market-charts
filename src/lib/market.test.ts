import { describe, expect, it } from "vitest";
import { aggregate, alertMet, heikinAshi, macd, parseBarsCsv, rsi, sma, workingFillPrice, type Bar } from "./market";
import { applyFill } from "@/server/paperMath";

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
const bar = (d: string, o: number, h: number, l: number, c: number, v = 100): Bar => ({ time: day(d), open: o, high: h, low: l, close: c, volume: v });

describe("csv", () => {
  it("parses rows, reports bad ones and reads header order", () => {
    const r = parseBarsCsv("close,date,open,high,low,volume\n10,2025-01-02,9,11,8,5\n10,2025-02-30,9,11,8,5\n10,2025-01-03,12,11,8,5");
    expect(r.bars).toEqual([{ time: day("2025-01-02"), open: 9, high: 11, low: 8, close: 10, volume: 5 }]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4]);
  });
  it("reads datetimes as intraday", () => {
    const r = parseBarsCsv("2026-01-05 14:30,1,2,0.5,1.5,10");
    expect(r.bars[0]!.time % 86400).not.toBe(0);
  });
});

describe("intervals", () => {
  const bars = [bar("2025-01-30", 1, 3, 1, 2), bar("2025-01-31", 2, 5, 2, 4), bar("2025-02-03", 4, 4, 1, 3)];
  it("builds months from days", () => {
    const m = aggregate(bars, "1M");
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ open: 1, high: 5, low: 1, close: 4, volume: 200 });
  });
  it("builds Monday-based weeks", () => {
    expect(aggregate(bars, "1W")).toHaveLength(2);
  });
  it("heikin ashi closes at the bar's average", () => {
    expect(heikinAshi(bars)[0]!.close).toBe(1.75);
  });
});

describe("indicators", () => {
  it("sma and rsi", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    const up = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(up, 14).at(-1)).toBe(100);
    expect(macd(up).line.at(-1)).toBeNull();
  });
});

describe("alerts", () => {
  const b = bar("2025-01-02", 100, 106, 99, 105);
  it("crossing up needs the previous close below", () => {
    expect(alertMet("crossing_up", 103, null, 101, b)).toBe(true);
    expect(alertMet("crossing_up", 103, null, 104, b)).toBe(false);
    expect(alertMet("entering_channel", 104, 110, 100, b)).toBe(true);
    expect(alertMet("moving_up_pct", 5, null, 100, b)).toBe(true);
    expect(alertMet("moving_down_pct", 1, null, 100, b)).toBe(false);
  });
});

describe("paper fills", () => {
  it("limits fill at the better of open and limit", () => {
    expect(workingFillPrice("buy", "limit", 99.5, bar("2025-01-02", 100, 101, 99, 100))).toBe(99.5);
    expect(workingFillPrice("buy", "limit", 101, bar("2025-01-02", 100, 101, 99, 100))).toBe(100);
    expect(workingFillPrice("sell", "stop", 98, bar("2025-01-02", 100, 101, 99, 100))).toBeNull();
  });
  it("rejects buys over cash and sells over the position", () => {
    const acct = { id: "a", cash: 1000, realizedPnl: 0, commissionPct: 0 };
    expect(applyFill(acct, null, "buy", 11, 100).ok).toBe(false);
    expect(applyFill(acct, { qty: 1, avgPrice: 5 }, "sell", 2, 10).ok).toBe(false);
    const sold = applyFill(acct, { qty: 2, avgPrice: 5 }, "sell", 2, 10);
    expect(sold).toMatchObject({ ok: true, cash: 1020, realizedPnl: 10, position: null });
  });
});
