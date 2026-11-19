import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { TablePagination } from "@/client/components/table/TablePagination";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { errorMessage, pct, price, tone, volume } from "@/client/lib/format";
import { ASSET_TYPE_LABELS, ASSET_TYPES, type AssetType } from "@/lib/market";
import { deleteScreenFn, listScreensFn, runScreenFn, saveScreenFn } from "@/serverFunctions/market";
import type { ScreenFilters } from "@/server/screener";

export const Route = createFileRoute("/screener")({
  loader: async () => ({ screens: await listScreensFn() }),
  component: ScreenerPage,
  errorComponent: RouteError,
});

type SortKey = "ticker" | "name" | "exchange" | "assetType" | "last" | "changePct" | "volume" | "rsi14" | "sma50" | "sma200";
type Result = Awaited<ReturnType<typeof runScreenFn>>;
const PAGE_SIZE = 25;

const NUMERIC: { key: keyof ScreenFilters; label: string }[] = [
  { key: "minPrice", label: "Min price" },
  { key: "maxPrice", label: "Max price" },
  { key: "minChangePct", label: "Min change %" },
  { key: "maxChangePct", label: "Max change %" },
  { key: "minVolume", label: "Min volume" },
  { key: "minRsi", label: "Min RSI" },
  { key: "maxRsi", label: "Max RSI" },
];
const TREND = [
  { value: "any", label: "Any" },
  { value: "above", label: "Above" },
  { value: "below", label: "Below" },
] as const;

type Form = { assetType: string; exchange: string; sma50: string; sma200: string; [key: string]: string };
const EMPTY: Form = { assetType: "any", exchange: "", sma50: "any", sma200: "any" };

function toFilters(form: Form): ScreenFilters {
  const f: ScreenFilters = {};
  if (form.assetType !== "any") f.assetType = form.assetType as AssetType;
  if (form.exchange.trim()) f.exchange = form.exchange.trim();
  if (form.sma50 !== "any") f.sma50 = form.sma50 as "above" | "below";
  if (form.sma200 !== "any") f.sma200 = form.sma200 as "above" | "below";
  for (const n of NUMERIC) {
    const raw = form[n.key];
    if (raw != null && raw !== "" && Number.isFinite(Number(raw))) (f as Record<string, number>)[n.key] = Number(raw);
  }
  return f;
}

function toForm(f: ScreenFilters): Form {
  const form: Form = { ...EMPTY, assetType: f.assetType ?? "any", exchange: f.exchange ?? "", sma50: f.sma50 ?? "any", sma200: f.sma200 ?? "any" };
  for (const n of NUMERIC) {
    const v = f[n.key];
    if (v != null) form[n.key] = String(v);
  }
  return form;
}

function ScreenerPage() {
  const { screens } = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [applied, setApplied] = useState<ScreenFilters>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "ticker", dir: "asc" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenId, setScreenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    runScreenFn({ data: { filters: applied, sort: sort.key, dir: sort.dir, page, pageSize: PAGE_SIZE } })
      .then((r) => live && setResult(r))
      .catch((e) => live && toast.error(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [applied, sort, page]);

  const column = (key: SortKey) => ({
    getIsSorted: () => (sort.key === key ? sort.dir : false) as false | "asc" | "desc",
    getToggleSortingHandler: () => () => {
      setPage(1);
      setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "ticker" || key === "name" ? "asc" : "desc" }));
    },
  });

  const apply = (filters: ScreenFilters) => {
    setPage(1);
    setApplied(filters);
  };

  const current = screens.find((s) => s.id === screenId);

  return (
    <AppShell>
      <PageHeader
        title="Screener"
        actions={
          <>
            {screens.length > 0 ? (
              <SimpleSelect
                testId="saved-screens"
                label="Saved screens"
                className="w-48"
                placeholder="Saved screens"
                value={screenId}
                onChange={(id) => {
                  const s = screens.find((x) => x.id === id);
                  if (!s) return;
                  setScreenId(id);
                  setForm(toForm(s.filters));
                  apply(s.filters);
                }}
                options={screens.map((s) => ({ value: s.id, label: s.name }))}
              />
            ) : null}
            {current ? (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                Delete screen
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setSaving(true)}>
              Save screen
            </Button>
          </>
        }
      />
      <Card>
        <CardContent>
          <form
            className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              apply(toFilters(form));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="f-type">Asset type</Label>
              <SimpleSelect
                id="f-type"
                testId="screen-asset-type"
                value={form.assetType}
                onChange={(v) => setForm({ ...form, assetType: v })}
                options={[{ value: "any" as const, label: "Any" }, ...ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_LABELS[t] }))]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-exchange">Exchange</Label>
              <Input id="f-exchange" value={form.exchange} onChange={(e) => setForm({ ...form, exchange: e.target.value })} />
            </div>
            {NUMERIC.map((n) => (
              <div key={n.key} className="grid gap-1.5">
                <Label htmlFor={`f-${n.key}`}>{n.label}</Label>
                <Input
                  id={`f-${n.key}`}
                  type="number"
                  step="any"
                  value={form[n.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [n.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="f-sma50">Price vs SMA 50</Label>
              <SimpleSelect id="f-sma50" testId="screen-sma50" value={form.sma50} onChange={(v) => setForm({ ...form, sma50: v })} options={TREND} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-sma200">Price vs SMA 200</Label>
              <SimpleSelect id="f-sma200" testId="screen-sma200" value={form.sma200} onChange={(v) => setForm({ ...form, sma200: v })} options={TREND} />
            </div>
            <div className="col-span-2 flex items-end gap-2 md:col-span-4 lg:col-span-6">
              <Button type="submit">Apply</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(EMPTY);
                  setScreenId(null);
                  apply({});
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && result.total === 0 && !loading ? (
        <EmptyState kind="filtered" title="No symbols match" description="Loosen a filter, or import prices for more symbols." />
      ) : result ? (
        <div className="space-y-3">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortableHeader column={column("ticker")} label="Symbol" /></TableHead>
                  <TableHead className="hidden md:table-cell"><SortableHeader column={column("exchange")} label="Exchange" /></TableHead>
                  <TableHead className="hidden sm:table-cell"><SortableHeader column={column("assetType")} label="Type" /></TableHead>
                  <TableHead className="text-right"><SortableHeader column={column("last")} label="Last" align="right" /></TableHead>
                  <TableHead className="text-right"><SortableHeader column={column("changePct")} label="Change %" align="right" /></TableHead>
                  <TableHead className="hidden text-right sm:table-cell"><SortableHeader column={column("volume")} label="Volume" align="right" /></TableHead>
                  <TableHead className="text-right"><SortableHeader column={column("rsi14")} label="RSI 14" align="right" /></TableHead>
                  <TableHead className="hidden text-right lg:table-cell"><SortableHeader column={column("sma50")} label="SMA 50" align="right" /></TableHead>
                  <TableHead className="hidden text-right lg:table-cell"><SortableHeader column={column("sma200")} label="SMA 200" align="right" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.symbolId} data-testid={`screen-row-${r.ticker}`}>
                    <TableCell>
                      <Link to="/chart" search={{ symbol: r.symbolId }} className="font-medium hover:underline">
                        {r.ticker}
                      </Link>
                      <div className="max-w-40 truncate text-xs text-muted-foreground">{r.name}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{r.exchange}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{ASSET_TYPE_LABELS[r.assetType as AssetType] ?? r.assetType}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{price(r.last)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${tone(r.changePct)}`}>{pct(r.changePct)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{volume(r.volume)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rsi14 != null ? r.rsi14.toFixed(1) : "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{price(r.sma50)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{price(r.sma200)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <TablePagination page={page} pageSize={PAGE_SIZE} totalCount={result.total} isLoading={loading} onPageChange={setPage} />
        </div>
      ) : null}

      {saving ? (
        <NameDialog
          title="Save screen"
          initial={current?.name ?? ""}
          onClose={() => setSaving(false)}
          onSave={async (name) => {
            const s = await saveScreenFn({ data: { name, filters: toFilters(form) } });
            await router.invalidate();
            setScreenId(s.id);
          }}
        />
      ) : null}
      {deleting && current ? (
        <ConfirmDialog
          title={`Delete "${current.name}"?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await deleteScreenFn({ data: { id: current.id } });
              setScreenId(null);
              await router.invalidate();
            } catch (error) {
              toast.error(errorMessage(error));
            }
            setDeleting(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}
