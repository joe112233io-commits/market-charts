// Mapping between bars, pixels, times and prices for the chart.
import type { Bar } from "@/lib/market";

export interface View {
  /** Bars shown across the plot. */
  count: number;
  /** Bars hidden to the right of the plot (negative leaves space after the last bar). */
  offset: number;
}

export function makeTimeMap(bars: Bar[]) {
  const n = bars.length;
  const times = bars.map((b) => b.time);
  const step = n > 1 ? (times[n - 1]! - times[0]!) / (n - 1) : 86400;
  const timeToIndex = (t: number): number => {
    if (n === 0) return 0;
    if (t <= times[0]!) return (t - times[0]!) / step;
    if (t >= times[n - 1]!) return n - 1 + (t - times[n - 1]!) / step;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - times[lo]!) / (times[hi]! - times[lo]!);
  };
  const indexToTime = (i: number): number => {
    if (n === 0) return 0;
    if (i <= 0) return Math.round(times[0]! + i * step);
    if (i >= n - 1) return Math.round(times[n - 1]! + (i - (n - 1)) * step);
    const lo = Math.floor(i);
    return Math.round(times[lo]! + (i - lo) * (times[lo + 1]! - times[lo]!));
  };
  return { timeToIndex, indexToTime };
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(+v.toFixed(10));
  return out;
}
