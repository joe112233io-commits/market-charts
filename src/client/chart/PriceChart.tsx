import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { barTime, price as fmtPrice, volume as fmtVolume } from "@/client/lib/format";
import {
  DRAWING_POINTS,
  FIB_LEVELS,
  INDICATORS,
  type ChartType,
  type Drawing,
  type DrawingKind,
  type IndicatorConfig,
} from "@/lib/chart";
import { bollinger, ema, heikinAshi, macd, rsi, sma, vwap, type Bar, type Interval, type Series } from "@/lib/market";
import { makeTimeMap, niceTicks, type View } from "./geometry";

const AXIS_W = 64;
const TIME_H = 22;
const TOP = 8;
const PANE_H = 110;
const LINE_CLASSES = ["stroke-chart-1", "stroke-chart-2", "stroke-chart-3", "stroke-chart-4", "stroke-chart-5"];

type Point = { time: number; price: number };

export function PriceChart({
  bars,
  ticker,
  interval,
  chartType,
  indicators,
  drawings,
  tool,
  selectedId,
  onAddDrawing,
  onTextRequest,
  onSelect,
  zoomRef,
}: {
  bars: Bar[];
  ticker: string;
  interval: Interval;
  chartType: ChartType;
  indicators: IndicatorConfig[];
  drawings: Drawing[];
  tool: DrawingKind | "cursor";
  selectedId: string | null;
  onAddDrawing: (d: Drawing) => void;
  onTextRequest: (p: Point) => void;
  onSelect: (id: string | null) => void;
  /** Lets the toolbar zoom: a factor below 1 zooms in. */
  zoomRef: React.MutableRefObject<((factor: number) => void) | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const n = bars.length;
  const mainH = width < 640 ? 320 : 420;
  const plotW = Math.max(40, width - AXIS_W);
  const plotH = mainH - TIME_H - TOP;

  const initialView = (w: number): View => ({ count: Math.max(Math.min(n, Math.floor((w - AXIS_W) / 7)), Math.min(n, 10)), offset: 0 });
  const [view, setView] = useState<View>({ count: 100, offset: 0 });
  const [hover, setHover] = useState<{ idx: number; y: number } | null>(null);
  const [pending, setPending] = useState<Point | null>(null);
  const [preview, setPreview] = useState<Point | null>(null);
  const drag = useRef<{ x0: number; offset0: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (width > 0) setView(initialView(width));
    // Reset the view when the data or the width class changes, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, width > 0]);

  useEffect(() => {
    setPending(null);
    setPreview(null);
  }, [tool]);

  const clampView = (v: View): View => {
    const count = Math.min(Math.max(v.count, Math.min(n, 5)), Math.max(n, 5));
    const offset = Math.min(Math.max(v.offset, -count * 0.5), Math.max(0, n - 3));
    return { count, offset };
  };
  const zoom = (factor: number) => setView((v) => clampView({ ...v, count: v.count * factor }));
  zoomRef.current = zoom;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const display = useMemo(() => (chartType === "heikin_ashi" ? heikinAshi(bars) : bars), [bars, chartType]);
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const timeMap = useMemo(() => makeTimeMap(bars), [bars]);

  const overlays = useMemo(() => {
    const out: { key: string; values: Series; className: string }[] = [];
    indicators.forEach((ind, k) => {
      const color = LINE_CLASSES[k % LINE_CLASSES.length]!;
      const p = (key: string) => ind.params[key] ?? INDICATORS[ind.type].params.find((x) => x.key === key)?.default ?? 0;
      if (ind.type === "sma") out.push({ key: ind.id, values: sma(closes, p("period")), className: color });
      if (ind.type === "ema") out.push({ key: ind.id, values: ema(closes, p("period")), className: color });
      if (ind.type === "vwap") out.push({ key: ind.id, values: vwap(bars), className: color });
      if (ind.type === "bb") {
        const b = bollinger(closes, p("period"), p("mult"));
        out.push({ key: `${ind.id}-u`, values: b.upper, className: color });
        out.push({ key: `${ind.id}-m`, values: b.mid, className: `${color} [stroke-dasharray:4_3]` });
        out.push({ key: `${ind.id}-l`, values: b.lower, className: color });
      }
    });
    return out;
  }, [indicators, closes, bars]);

  const barW = plotW / view.count;
  const end = n - 1 - view.offset;
  const x = (i: number) => plotW - (end - i + 0.5) * barW;
  const xToIndex = (px: number) => end - (plotW - px) / barW + 0.5;
  const first = Math.max(0, Math.floor(xToIndex(0)));
  const last = Math.min(n - 1, Math.ceil(xToIndex(plotW) - 1));
  const visible = last >= first ? last - first + 1 : 0;

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = first; i <= last; i++) {
    lo = Math.min(lo, display[i]!.low);
    hi = Math.max(hi, display[i]!.high);
    for (const o of overlays) {
      const v = o.values[i];
      if (v != null) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const y = (p: number) => TOP + ((hi - p) / (hi - lo)) * plotH;
  const yToPrice = (py: number) => hi - ((py - TOP) / plotH) * (hi - lo);

  const toPx = (p: Point) => ({ x: x(timeMap.timeToIndex(p.time)), y: y(p.price) });
  const localPoint = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const pointAt = (px: number, py: number): Point => ({ time: timeMap.indexToTime(xToIndex(px)), price: yToPrice(py) });

  const hoverIdx = hover && n > 0 ? Math.min(n - 1, Math.max(0, Math.round(hover.idx))) : null;
  const legendBar = n > 0 ? display[hoverIdx ?? n - 1]! : null;

  const timeLabel = (t: number) => {
    const d = new Date(t * 1000);
    if (interval === "intraday") return d.toISOString().slice(11, 16);
    if (interval === "1M") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  const labelEvery = Math.max(1, Math.ceil(90 / barW));

  const crosshairX = hoverIdx != null ? x(hoverIdx) : null;

  const series = (values: Series, className: string, key: string, yy: (v: number) => number = y) => {
    let d = "";
    for (let i = Math.max(0, first - 1); i <= Math.min(n - 1, last + 1); i++) {
      const v = values[i];
      if (v == null) continue;
      d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${yy(v).toFixed(1)}`;
    }
    return <path key={key} d={d} className={cn("fill-none", className)} strokeWidth={1.4} />;
  };

  const priceMarks = () => {
    const out: ReactNode[] = [];
    const body = Math.max(1, barW * 0.7);
    if (chartType === "line" || chartType === "area") {
      let d = "";
      for (let i = Math.max(0, first - 1); i <= Math.min(n - 1, last + 1); i++) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(display[i]!.close).toFixed(1)}`;
      if (chartType === "area" && d) {
        const a = Math.max(0, first - 1);
        const b = Math.min(n - 1, last + 1);
        out.push(<path key="fill" d={`${d}L${x(b)},${TOP + plotH}L${x(a)},${TOP + plotH}Z`} className="fill-primary/15" />);
      }
      out.push(<path key="line" d={d} className="fill-none stroke-primary" strokeWidth={1.6} />);
      return out;
    }
    for (let i = first; i <= last; i++) {
      const b = display[i]!;
      const up = b.close >= b.open;
      const color = up ? "stroke-success" : "stroke-destructive";
      const cx = x(i);
      if (chartType === "bars") {
        out.push(
          <g key={i} className={color} strokeWidth={1.2}>
            <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} />
            <line x1={cx - body / 2} x2={cx} y1={y(b.open)} y2={y(b.open)} />
            <line x1={cx} x2={cx + body / 2} y1={y(b.close)} y2={y(b.close)} />
          </g>,
        );
        continue;
      }
      const top = y(Math.max(b.open, b.close));
      const h = Math.max(1, Math.abs(y(b.open) - y(b.close)));
      const hollow = chartType === "hollow_candles" && up;
      out.push(
        <g key={i} className={color}>
          <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} strokeWidth={1} />
          <rect
            x={cx - body / 2}
            y={top}
            width={body}
            height={h}
            className={hollow ? "fill-card" : up ? "fill-success" : "fill-destructive"}
            strokeWidth={1}
          />
        </g>,
      );
    }
    return out;
  };

  const drawingShape = (d: Drawing, isPreview = false) => {
    const sel = d.id === selectedId;
    const stroke = sel ? "stroke-primary" : "stroke-info";
    const pts = d.points.map(toPx);
    const a = pts[0]!;
    const b = pts[1] ?? a;
    const hit = (el: ReactNode) => el;
    let shape: ReactNode = null;
    if (d.kind === "trend") {
      shape = (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={stroke} strokeWidth={sel ? 2.5 : 1.6} />
          {hit(<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-transparent" strokeWidth={12} />)}
        </>
      );
    } else if (d.kind === "ray") {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const far = { x: a.x + (dx / len) * 5000, y: a.y + (dy / len) * 5000 };
      shape = (
        <>
          <line x1={a.x} y1={a.y} x2={far.x} y2={far.y} className={stroke} strokeWidth={sel ? 2.5 : 1.6} />
          <line x1={a.x} y1={a.y} x2={far.x} y2={far.y} className="stroke-transparent" strokeWidth={12} />
        </>
      );
    } else if (d.kind === "horizontal") {
      shape = (
        <>
          <line x1={0} x2={plotW} y1={a.y} y2={a.y} className={stroke} strokeWidth={sel ? 2.5 : 1.4} />
          <line x1={0} x2={plotW} y1={a.y} y2={a.y} className="stroke-transparent" strokeWidth={12} />
        </>
      );
    } else if (d.kind === "rectangle") {
      shape = (
        <rect
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)}
          height={Math.abs(b.y - a.y)}
          className={cn(stroke, "fill-info/10")}
          strokeWidth={sel ? 2.5 : 1.4}
        />
      );
    } else if (d.kind === "fib") {
      const p1 = d.points[0]!.price;
      const p2 = (d.points[1] ?? d.points[0]!).price;
      const left = Math.min(a.x, b.x);
      shape = (
        <>
          {FIB_LEVELS.map((lvl) => {
            const p = p2 - (p2 - p1) * lvl;
            const yy = y(p);
            return (
              <g key={lvl}>
                <line x1={left} x2={plotW} y1={yy} y2={yy} className={stroke} strokeWidth={sel ? 2 : 1} />
                <line x1={left} x2={plotW} y1={yy} y2={yy} className="stroke-transparent" strokeWidth={10} />
                <text x={left + 4} y={yy - 3} className="fill-muted-foreground text-[10px]">
                  {lvl} ({fmtPrice(p)})
                </text>
              </g>
            );
          })}
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cn(stroke, "[stroke-dasharray:3_3]")} strokeWidth={1} />
        </>
      );
    } else if (d.kind === "text") {
      shape = (
        <text x={a.x} y={a.y} className={cn("text-xs font-medium", sel ? "fill-primary" : "fill-foreground")}>
          {d.text}
        </text>
      );
    }
    if (isPreview) return <g key="preview" className="pointer-events-none opacity-60">{shape}</g>;
    return (
      <g
        key={d.id}
        data-testid="drawing"
        data-kind={d.kind}
        aria-label={d.kind}
        className={tool === "cursor" ? "cursor-pointer" : "pointer-events-none"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(d.id);
        }}
      >
        {shape}
        {sel ? pts.map((p, k) => <circle key={k} cx={p.x} cy={p.y} r={4} className="fill-card stroke-primary" strokeWidth={1.5} />) : null}
      </g>
    );
  };

  const yTicks = niceTicks(lo + pad, hi - pad, 6);
  const clipId = `plot-${ticker}`;
  const pane = indicators.filter((i) => INDICATORS[i.type].pane);

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      {width > 0 ? (
        <>
          <div
            data-testid="ohlc-legend"
            className="pointer-events-none absolute top-1 left-2 z-10 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground"
          >
            <span className="font-medium text-foreground">{ticker}</span>
            {legendBar ? (
              <>
                <span>{barTime(legendBar.time)}</span>
                <span>O {fmtPrice(legendBar.open)}</span>
                <span>H {fmtPrice(legendBar.high)}</span>
                <span>L {fmtPrice(legendBar.low)}</span>
                <span className={legendBar.close >= legendBar.open ? "text-success" : "text-destructive"}>C {fmtPrice(legendBar.close)}</span>
                <span>V {fmtVolume(bars[hoverIdx ?? n - 1]!.volume)}</span>
              </>
            ) : null}
          </div>
          <svg
            ref={svgRef}
            data-testid="chart"
            data-symbol={ticker}
            data-type={chartType}
            data-interval={interval}
            data-bars={n}
            data-visible={visible}
            width={width}
            height={mainH}
            className={cn("block touch-none", tool === "cursor" ? "cursor-crosshair" : "cursor-copy")}
            onPointerDown={(e) => {
              if (tool !== "cursor") return;
              drag.current = { x0: e.clientX, offset0: view.offset, moved: false };
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const { px, py } = localPoint(e);
              if (drag.current) {
                const dx = e.clientX - drag.current.x0;
                if (Math.abs(dx) > 3) drag.current.moved = true;
                if (drag.current.moved) setView((v) => clampView({ ...v, offset: drag.current!.offset0 + dx / barW }));
              }
              if (px <= plotW) setHover({ idx: xToIndex(px), y: py });
              else setHover(null);
              if (pending) setPreview(pointAt(Math.min(px, plotW), py));
            }}
            onPointerUp={() => {
              suppressClick.current = !!drag.current?.moved;
              drag.current = null;
            }}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              const { px, py } = localPoint(e);
              if (tool === "cursor") {
                onSelect(null);
                return;
              }
              if (px > plotW || n === 0) return;
              const p = pointAt(px, py);
              if (DRAWING_POINTS[tool] === 1) {
                if (tool === "text") onTextRequest(p);
                else onAddDrawing({ id: crypto.randomUUID(), kind: tool, points: [p] });
                return;
              }
              if (!pending) {
                setPending(p);
                setPreview(p);
              } else {
                onAddDrawing({ id: crypto.randomUUID(), kind: tool, points: [pending, p] });
                setPending(null);
                setPreview(null);
              }
            }}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={plotW} height={TOP + plotH} />
              </clipPath>
            </defs>
            <rect x={0} y={0} width={width} height={mainH} className="fill-card" />
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={0.6} />
                <text x={plotW + 6} y={y(t) + 4} className="fill-muted-foreground text-[10px] tabular-nums">
                  {fmtPrice(t)}
                </text>
              </g>
            ))}
            <line x1={plotW} x2={plotW} y1={0} y2={mainH} className="stroke-border" />
            <line x1={0} x2={width} y1={TOP + plotH} y2={TOP + plotH} className="stroke-border" />
            {Array.from({ length: visible }, (_, k) => first + k)
              .filter((i) => i % labelEvery === 0)
              .map((i) => (
                <text key={i} x={x(i)} y={mainH - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {timeLabel(bars[i]!.time)}
                </text>
              ))}
            <g clipPath={`url(#${clipId})`}>
              {priceMarks()}
              {overlays.map((o) => series(o.values, o.className, o.key))}
              {drawings.map((d) => drawingShape(d))}
              {pending && preview && tool !== "cursor"
                ? drawingShape({ id: "preview", kind: tool, points: [pending, preview] }, true)
                : null}
            </g>
            {n > 0 ? (
              <g className="pointer-events-none">
                <rect x={plotW} y={y(bars[n - 1]!.close) - 8} width={AXIS_W} height={16} className="fill-primary" />
                <text x={plotW + 6} y={y(bars[n - 1]!.close) + 4} className="fill-primary-foreground text-[10px] tabular-nums">
                  {fmtPrice(bars[n - 1]!.close)}
                </text>
              </g>
            ) : null}
            {hover && crosshairX != null ? (
              <g className="pointer-events-none">
                <line x1={crosshairX} x2={crosshairX} y1={0} y2={TOP + plotH} className="stroke-muted-foreground [stroke-dasharray:3_3]" />
                <line x1={0} x2={plotW} y1={hover.y} y2={hover.y} className="stroke-muted-foreground [stroke-dasharray:3_3]" />
                <rect x={plotW} y={hover.y - 8} width={AXIS_W} height={16} className="fill-foreground" />
                <text x={plotW + 6} y={hover.y + 4} className="fill-background text-[10px] tabular-nums">
                  {fmtPrice(yToPrice(hover.y))}
                </text>
              </g>
            ) : null}
          </svg>
          {pane.map((ind) => (
            <IndicatorPane
              key={ind.id}
              indicator={ind}
              bars={bars}
              closes={closes}
              width={width}
              plotW={plotW}
              x={x}
              first={first}
              last={last}
              crosshairX={hover ? crosshairX : null}
              hoverIdx={hover ? hoverIdx : null}
            />
          ))}
        </>
      ) : (
        <div style={{ height: 420 }} />
      )}
    </div>
  );
}

function IndicatorPane({
  indicator,
  bars,
  closes,
  width,
  plotW,
  x,
  first,
  last,
  crosshairX,
  hoverIdx,
}: {
  indicator: IndicatorConfig;
  bars: Bar[];
  closes: number[];
  width: number;
  plotW: number;
  x: (i: number) => number;
  first: number;
  last: number;
  crosshairX: number | null;
  hoverIdx: number | null;
}) {
  const p = (key: string) => indicator.params[key] ?? INDICATORS[indicator.type].params.find((d) => d.key === key)?.default ?? 0;
  const data = useMemo(() => {
    if (indicator.type === "rsi") return { rsi: rsi(closes, p("period")) };
    if (indicator.type === "macd") return macd(closes, p("fast"), p("slow"), p("signal"));
    return {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator, closes]);
  const h = PANE_H;
  let lo = Infinity;
  let hi = -Infinity;
  const take = (s: Series | undefined) => {
    if (!s) return;
    for (let i = first; i <= last; i++) {
      const v = s[i];
      if (v != null) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  };
  let title = "";
  let readout = "";
  if (indicator.type === "volume") {
    lo = 0;
    hi = 0;
    for (let i = first; i <= last; i++) hi = Math.max(hi, bars[i]!.volume);
    title = "Volume";
    readout = fmtVolume(bars[hoverIdx ?? bars.length - 1]?.volume);
  } else if (indicator.type === "rsi") {
    lo = 0;
    hi = 100;
    title = `RSI ${p("period")}`;
    const v = (data as { rsi: Series }).rsi[hoverIdx ?? bars.length - 1];
    readout = v != null ? v.toFixed(2) : "—";
  } else {
    const m = data as ReturnType<typeof macd>;
    take(m.line);
    take(m.signal);
    take(m.hist);
    title = `MACD ${p("fast")} ${p("slow")} ${p("signal")}`;
    const v = m.line[hoverIdx ?? bars.length - 1];
    readout = v != null ? v.toFixed(3) : "—";
  }
  if (!Number.isFinite(lo) || hi === lo) {
    lo = Number.isFinite(lo) ? lo - 1 : 0;
    hi = Number.isFinite(hi) ? hi + 1 : 1;
  }
  const y = (v: number) => 6 + ((hi - v) / (hi - lo)) * (h - 12);
  const barW = Math.max(1, (x(1) - x(0)) * 0.7);
  const line = (s: Series, className: string) => {
    let d = "";
    for (let i = Math.max(0, first - 1); i <= Math.min(bars.length - 1, last + 1); i++) {
      const v = s[i];
      if (v == null) continue;
      d += `${d && s[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }
    return <path d={d} className={cn("fill-none", className)} strokeWidth={1.3} />;
  };
  const idx = Array.from({ length: Math.max(0, last - first + 1) }, (_, k) => first + k);
  return (
    <div className="relative border-t border-border" data-testid={`pane-${indicator.type}`}>
      <span className="pointer-events-none absolute top-1 left-2 text-xs tabular-nums text-muted-foreground">
        {title} <span className="text-foreground">{readout}</span>
      </span>
      <svg width={width} height={h} className="block">
        <rect x={0} y={0} width={width} height={h} className="fill-card" />
        <line x1={plotW} x2={plotW} y1={0} y2={h} className="stroke-border" />
        <defs>
          <clipPath id={`pane-${indicator.id}`}>
            <rect x={0} y={0} width={plotW} height={h} />
          </clipPath>
        </defs>
        <g clipPath={`url(#pane-${indicator.id})`}>
          {indicator.type === "volume"
            ? idx.map((i) => (
                <rect
                  key={i}
                  x={x(i) - barW / 2}
                  y={y(bars[i]!.volume)}
                  width={barW}
                  height={Math.max(0, h - 6 - y(bars[i]!.volume))}
                  className={bars[i]!.close >= bars[i]!.open ? "fill-success/50" : "fill-destructive/50"}
                />
              ))
            : null}
          {indicator.type === "rsi" ? (
            <>
              <rect x={0} y={y(70)} width={plotW} height={y(30) - y(70)} className="fill-primary/5" />
              <line x1={0} x2={plotW} y1={y(70)} y2={y(70)} className="stroke-border [stroke-dasharray:3_3]" />
              <line x1={0} x2={plotW} y1={y(30)} y2={y(30)} className="stroke-border [stroke-dasharray:3_3]" />
              {line((data as { rsi: Series }).rsi, "stroke-chart-4")}
            </>
          ) : null}
          {indicator.type === "macd" ? (
            <>
              <line x1={0} x2={plotW} y1={y(0)} y2={y(0)} className="stroke-border" />
              {idx.map((i) => {
                const v = (data as ReturnType<typeof macd>).hist[i];
                if (v == null) return null;
                return (
                  <rect
                    key={i}
                    x={x(i) - barW / 2}
                    y={Math.min(y(v), y(0))}
                    width={barW}
                    height={Math.abs(y(v) - y(0))}
                    className={v >= 0 ? "fill-success/50" : "fill-destructive/50"}
                  />
                );
              })}
              {line((data as ReturnType<typeof macd>).line, "stroke-chart-1")}
              {line((data as ReturnType<typeof macd>).signal, "stroke-chart-3")}
            </>
          ) : null}
        </g>
        {indicator.type === "rsi"
          ? [30, 70].map((v) => (
              <text key={v} x={plotW + 6} y={y(v) + 4} className="fill-muted-foreground text-[10px]">
                {v}
              </text>
            ))
          : null}
        {crosshairX != null ? <line x1={crosshairX} x2={crosshairX} y1={0} y2={h} className="pointer-events-none stroke-muted-foreground [stroke-dasharray:3_3]" /> : null}
      </svg>
    </div>
  );
}
