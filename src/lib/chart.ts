// The chart's vocabulary, shared by the page and the layout schema.

export const CHART_TYPES = ["candles", "hollow_candles", "bars", "line", "area", "heikin_ashi"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candles: "Candles",
  hollow_candles: "Hollow candles",
  bars: "Bars",
  line: "Line",
  area: "Area",
  heikin_ashi: "Heikin Ashi",
};

export const INDICATOR_TYPES = ["sma", "ema", "bb", "vwap", "volume", "rsi", "macd"] as const;
export type IndicatorType = (typeof INDICATOR_TYPES)[number];

export interface IndicatorDef {
  label: string;
  short: string;
  /** Drawn over price, or in a pane of its own. */
  pane: boolean;
  params: { key: string; label: string; default: number; min: number; max: number; step?: number }[];
}

export const INDICATORS: Record<IndicatorType, IndicatorDef> = {
  sma: { label: "SMA", short: "SMA", pane: false, params: [{ key: "period", label: "Period", default: 20, min: 1, max: 500 }] },
  ema: { label: "EMA", short: "EMA", pane: false, params: [{ key: "period", label: "Period", default: 20, min: 1, max: 500 }] },
  bb: {
    label: "Bollinger Bands",
    short: "BB",
    pane: false,
    params: [
      { key: "period", label: "Period", default: 20, min: 2, max: 500 },
      { key: "mult", label: "Std. dev.", default: 2, min: 0.5, max: 5, step: 0.1 },
    ],
  },
  vwap: { label: "VWAP", short: "VWAP", pane: false, params: [] },
  volume: { label: "Volume", short: "Volume", pane: true, params: [] },
  rsi: { label: "RSI", short: "RSI", pane: true, params: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }] },
  macd: {
    label: "MACD",
    short: "MACD",
    pane: true,
    params: [
      { key: "fast", label: "Fast", default: 12, min: 1, max: 200 },
      { key: "slow", label: "Slow", default: 26, min: 2, max: 400 },
      { key: "signal", label: "Signal", default: 9, min: 1, max: 200 },
    ],
  },
};

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  params: Record<string, number>;
}

export function indicatorLabel(i: IndicatorConfig): string {
  const def = INDICATORS[i.type];
  return [def.short, ...def.params.map((p) => String(i.params[p.key] ?? p.default))].join(" ");
}

export const DRAWING_KINDS = ["trend", "horizontal", "ray", "rectangle", "fib", "text"] as const;
export type DrawingKind = (typeof DRAWING_KINDS)[number];
export const DRAWING_LABELS: Record<DrawingKind, string> = {
  trend: "Trend line",
  horizontal: "Horizontal line",
  ray: "Ray",
  rectangle: "Rectangle",
  fib: "Fibonacci retracement",
  text: "Text note",
};
export const DRAWING_POINTS: Record<DrawingKind, 1 | 2> = { trend: 2, horizontal: 1, ray: 2, rectangle: 2, fib: 2, text: 1 };

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: { time: number; price: number }[];
  text?: string;
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
