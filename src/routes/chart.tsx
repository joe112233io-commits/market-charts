import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BellPlus, Minus, MousePointer2, Plus, Settings2, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { ErrorState } from "@/client/components/ErrorState";
import { FormDialog } from "@/client/components/FormDialog";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { PriceChart } from "@/client/chart/PriceChart";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import { errorMessage } from "@/client/lib/format";
import {
  CHART_TYPE_LABELS,
  CHART_TYPES,
  DRAWING_KINDS,
  DRAWING_LABELS,
  INDICATOR_TYPES,
  INDICATORS,
  indicatorLabel,
  type ChartType,
  type Drawing,
  type DrawingKind,
  type IndicatorConfig,
} from "@/lib/chart";
import type { Bar, Interval } from "@/lib/market";
import { getLayoutFn, saveLayoutFn, updateLayoutFn } from "@/serverFunctions/lists";
import { getBarsFn, listSymbolsFn } from "@/serverFunctions/market";

const search = z.object({ symbol: z.string().optional(), layout: z.string().optional() });

export const Route = createFileRoute("/chart")({
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    symbols: await listSymbolsFn(),
    layout: deps.layout ? await getLayoutFn({ data: { id: deps.layout } }) : null,
  }),
  ssr: false,
  component: ChartPage,
  errorComponent: RouteError,
  pendingComponent: () => (
    <AppShell>
      <Spinner />
    </AppShell>
  ),
});

const INTERVAL_LABELS: Record<Interval, string> = { intraday: "Intraday", "1D": "1D", "1W": "1W", "1M": "1M" };

function ChartPage() {
  const { symbols, layout } = Route.useLoaderData();
  const { symbol } = Route.useSearch();
  if (symbols.length === 0) {
    return (
      <AppShell>
        <PageHeader title="Chart" />
        <EmptyState
          title="No symbols yet"
          description="Add a symbol and import its prices to chart it."
          action={<Button nativeButton={false} render={<Link to="/" />}>Go to symbols</Button>}
        />
      </AppShell>
    );
  }
  const initialSymbol = layout?.symbolId ?? (symbols.some((s) => s.id === symbol) ? symbol! : symbols[0]!.id);
  return <Workspace key={layout?.id ?? initialSymbol} symbols={symbols} layout={layout} initialSymbol={initialSymbol} />;
}

type Layout = NonNullable<ReturnType<typeof Route.useLoaderData>["layout"]>;

function Workspace({
  symbols,
  layout,
  initialSymbol,
}: {
  symbols: { id: string; ticker: string }[];
  layout: Layout | null;
  initialSymbol: string;
}) {
  const navigate = useNavigate();
  const [symbolId, setSymbolId] = useState(initialSymbol);
  const [interval, setInterval] = useState<Interval>((layout?.interval as Interval) ?? "1D");
  const [chartType, setChartType] = useState<ChartType>((layout?.chartType as ChartType) ?? "candles");
  const [indicators, setIndicators] = useState<IndicatorConfig[]>((layout?.indicators as IndicatorConfig[]) ?? []);
  const [drawings, setDrawings] = useState<Drawing[]>((layout?.drawings as Drawing[]) ?? []);
  const [tool, setTool] = useState<DrawingKind | "cursor">("cursor");
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<{ bars: Bar[]; hasIntraday: boolean; ticker: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<IndicatorConfig | null>(null);
  const [textAt, setTextAt] = useState<{ time: number; price: number } | null>(null);
  const [saving, setSaving] = useState<"new" | null>(null);
  const [busy, setBusy] = useState(false);
  const zoomRef = useRef<((f: number) => void) | null>(null);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    getBarsFn({ data: { id: symbolId, interval } })
      .then((r) => live && setData(r))
      .catch((e) => live && setLoadError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [symbolId, interval]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        setDrawings((d) => d.filter((x) => x.id !== selected));
        setSelected(null);
      }
      if (e.key === "Escape") setTool("cursor");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const state = () => ({ symbolId, interval, chartType, indicators, drawings });

  const save = async () => {
    if (!layout) return setSaving("new");
    setBusy(true);
    try {
      await updateLayoutFn({ data: { id: layout.id, ...state() } });
      toast.success("Layout saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const intervals: Interval[] = data?.hasIntraday ? ["intraday", "1D", "1W", "1M"] : ["1D", "1W", "1M"];

  return (
    <AppShell>
      <PageHeader
        title={layout ? layout.name : "Chart"}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link to="/alerts" search={{ symbol: symbolId }} />}>
              <BellPlus /> Alert
            </Button>
            {layout ? (
              <Button variant="outline" onClick={() => setSaving("new")}>
                Save as new
              </Button>
            ) : null}
            <Button onClick={save} pending={busy}>
              Save layout
            </Button>
          </>
        }
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect
            testId="chart-symbol"
            label="Symbol"
            className="w-32"
            value={symbolId}
            onChange={(v) => {
              setSymbolId(v);
              setDrawings([]);
              setSelected(null);
            }}
            options={symbols.map((s) => ({ value: s.id, label: s.ticker }))}
          />
          <SimpleSelect
            testId="chart-interval"
            label="Interval"
            className="w-28"
            value={interval}
            onChange={setInterval}
            options={intervals.map((i) => ({ value: i, label: INTERVAL_LABELS[i] }))}
          />
          <SimpleSelect
            testId="chart-type"
            label="Chart type"
            className="w-40"
            value={chartType}
            onChange={setChartType}
            options={CHART_TYPES.map((t) => ({ value: t, label: CHART_TYPE_LABELS[t] }))}
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <Plus /> Indicators
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {INDICATOR_TYPES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onClick={() =>
                    setIndicators((list) => [
                      ...list,
                      {
                        id: crypto.randomUUID().slice(0, 8),
                        type: t,
                        params: Object.fromEntries(INDICATORS[t].params.map((p) => [p.key, p.default])),
                      },
                    ])
                  }
                >
                  {INDICATORS[t].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomRef.current?.(1.25)}>
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomRef.current?.(0.8)}>
              <ZoomIn />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={tool === "cursor" ? "secondary" : "ghost"}
            aria-pressed={tool === "cursor"}
            aria-label="Select"
            onClick={() => setTool("cursor")}
          >
            <MousePointer2 />
          </Button>
          {DRAWING_KINDS.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={tool === k ? "secondary" : "ghost"}
              aria-pressed={tool === k}
              aria-label={DRAWING_LABELS[k]}
              onClick={() => {
                setTool(k);
                setSelected(null);
              }}
            >
              <DrawingIcon kind={k} /> <span className="hidden lg:inline">{DRAWING_LABELS[k]}</span>
            </Button>
          ))}
          {selected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDrawings((d) => d.filter((x) => x.id !== selected));
                setSelected(null);
              }}
            >
              <Trash2 /> Delete drawing
            </Button>
          ) : null}
        </div>

        {indicators.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {indicators.map((ind) => {
              const label = indicatorLabel(ind);
              return (
                <span
                  key={ind.id}
                  data-testid="indicator-chip"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card py-0.5 pr-1 pl-2 text-xs"
                >
                  {label}
                  {INDICATORS[ind.type].params.length > 0 ? (
                    <Button variant="ghost" size="icon-xs" aria-label={`Settings for ${label}`} onClick={() => setEditing(ind)}>
                      <Settings2 />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${label}`}
                    onClick={() => setIndicators((list) => list.filter((x) => x.id !== ind.id))}
                  >
                    <X />
                  </Button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border">
          {loadError ? (
            <ErrorState message={loadError} variant="inline" />
          ) : !data ? (
            <div className="flex h-[420px] items-center justify-center">
              <Spinner />
            </div>
          ) : data.bars.length === 0 ? (
            <EmptyState
              variant="plain"
              title={`No ${interval === "intraday" ? "intraday " : ""}bars for ${data.ticker}`}
              description="Import a CSV on the symbol's page."
              action={
                <Button variant="outline" nativeButton={false} render={<Link to="/symbols/$symbolId" params={{ symbolId }} />}>
                  Open {data.ticker}
                </Button>
              }
            />
          ) : (
            <PriceChart
              bars={data.bars}
              ticker={data.ticker}
              interval={interval}
              chartType={chartType}
              indicators={indicators}
              drawings={drawings}
              tool={tool}
              selectedId={selected}
              zoomRef={zoomRef}
              onAddDrawing={(d) => {
                setDrawings((list) => [...list, d]);
                setTool("cursor");
              }}
              onTextRequest={(p) => setTextAt(p)}
              onSelect={setSelected}
            />
          )}
        </div>
      </div>

      {editing ? (
        <IndicatorDialog
          indicator={editing}
          onClose={() => setEditing(null)}
          onApply={(params) => {
            setIndicators((list) => list.map((x) => (x.id === editing.id ? { ...x, params } : x)));
            setEditing(null);
          }}
        />
      ) : null}
      {textAt ? (
        <TextDialog
          onClose={() => {
            setTextAt(null);
            setTool("cursor");
          }}
          onAdd={(text) => {
            setDrawings((list) => [...list, { id: crypto.randomUUID(), kind: "text", points: [textAt], text }]);
            setTextAt(null);
            setTool("cursor");
          }}
        />
      ) : null}
      {saving ? (
        <NameDialog
          title="Save layout"
          initial={layout ? `${layout.name} copy` : `${data?.ticker ?? ""} ${INTERVAL_LABELS[interval]}`.trim()}
          onClose={() => setSaving(null)}
          onSave={async (name) => {
            const saved = await saveLayoutFn({ data: { name, ...state() } });
            toast.success("Layout saved");
            await navigate({ to: "/chart", search: { layout: saved.id } });
          }}
        />
      ) : null}
    </AppShell>
  );
}

function DrawingIcon({ kind }: { kind: DrawingKind }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;
  if (kind === "trend") return <svg {...common}><line x1="2" y1="13" x2="14" y2="3" /></svg>;
  if (kind === "horizontal") return <Minus />;
  if (kind === "ray") return <svg {...common}><circle cx="3" cy="12" r="1.5" /><line x1="4" y1="11" x2="15" y2="3" /></svg>;
  if (kind === "rectangle") return <svg {...common}><rect x="2.5" y="4" width="11" height="8" /></svg>;
  if (kind === "fib") return <svg {...common}><line x1="2" y1="3" x2="14" y2="3" /><line x1="2" y1="7" x2="14" y2="7" /><line x1="2" y1="10" x2="14" y2="10" /><line x1="2" y1="13" x2="14" y2="13" /></svg>;
  return <svg {...common}><path d="M3 3h10M8 3v10" /></svg>;
}

function IndicatorDialog({
  indicator,
  onClose,
  onApply,
}: {
  indicator: IndicatorConfig;
  onClose: () => void;
  onApply: (params: Record<string, number>) => void;
}) {
  const def = INDICATORS[indicator.type];
  const [values, setValues] = useState(() =>
    Object.fromEntries(def.params.map((p) => [p.key, String(indicator.params[p.key] ?? p.default)])),
  );
  const parsed = def.params.map((p) => {
    const v = Number(values[p.key]);
    return Number.isFinite(v) && v >= p.min && v <= p.max ? v : null;
  });
  const valid = parsed.every((v) => v != null);
  return (
    <FormDialog
      title={def.label}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="indicator-form" disabled={!valid}>Apply</Button>
        </>
      }
    >
      <form
        id="indicator-form"
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onApply(Object.fromEntries(def.params.map((p, i) => [p.key, parsed[i]!])));
        }}
      >
        {def.params.map((p) => (
          <div key={p.key} className="grid gap-1.5">
            <Label htmlFor={`param-${p.key}`}>{p.label}</Label>
            <Input
              id={`param-${p.key}`}
              type="number"
              min={p.min}
              max={p.max}
              step={p.step ?? 1}
              value={values[p.key]}
              onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
            />
          </div>
        ))}
      </form>
    </FormDialog>
  );
}

function TextDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <FormDialog
      title="Text note"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="note-form" disabled={!text.trim()}>Add note</Button>
        </>
      }
    >
      <form
        id="note-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onAdd(text.trim().slice(0, 200));
        }}
        className="grid gap-1.5"
      >
        <Label htmlFor="note-text">Note</Label>
        <Input id="note-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoFocus />
      </form>
    </FormDialog>
  );
}
