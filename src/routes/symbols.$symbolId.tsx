import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { CandlestickChart, ChevronLeft, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, pct, price, signed, tone, volume } from "@/client/lib/format";
import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/market";
import { deleteSymbolFn, getSymbolFn, importBarsFn } from "@/serverFunctions/market";

export const Route = createFileRoute("/symbols/$symbolId")({
  loader: ({ params }) => getSymbolFn({ data: { id: params.symbolId } }),
  component: SymbolPage,
  errorComponent: RouteError,
});

type ImportResult = Awaited<ReturnType<typeof importBarsFn>>;

function SymbolPage() {
  const s = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = async (text: string) => {
    setImporting(true);
    try {
      const r = await importBarsFn({ data: { id: s.id, csv: text } });
      setResult(r);
      setCsv("");
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteSymbolFn({ data: { id: s.id } });
      await navigate({ to: "/" });
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden /> Symbols
          </Link>
        }
        title={`${s.ticker} · ${s.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {s.exchange} <Badge variant="secondary">{ASSET_TYPE_LABELS[s.assetType as AssetType] ?? s.assetType}</Badge> {s.currency}
          </span>
        }
        actions={
          <>
            <Button nativeButton={false} render={<Link to="/chart" search={{ symbol: s.id }} />}>
              <CandlestickChart /> Open chart
            </Button>
            {s.canDelete ? (
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete symbol
              </Button>
            ) : null}
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Last" testId="quote-last" value={price(s.last)} />
        <Stat label="Change" testId="quote-change" value={signed(s.change)} className={tone(s.change)} />
        <Stat label="Change %" testId="quote-change-pct" value={pct(s.changePct)} className={tone(s.changePct)} />
        <Stat label="Volume" testId="quote-volume" value={volume(s.volume)} />
      </dl>
      <p className="text-sm text-muted-foreground" data-testid="data-range">
        {s.barCount === 0
          ? "No price history yet."
          : `${s.barCount.toLocaleString()} bars from ${s.firstTime!.slice(0, 10)} to ${s.lastTime!.slice(0, 10)}${s.hasIntraday ? ", including intraday" : ""}`}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Import bars</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="csv">CSV</Label>
            <Textarea
              id="csv"
              rows={6}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={"date,open,high,low,close,volume\n2025-06-02,101.2,103.8,100.9,103.1,1250000"}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => runImport(csv)} disabled={!csv.trim()} pending={importing}>
              Import bars
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              aria-label="Upload CSV file"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) await runImport(await file.text());
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload /> Upload file
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Columns: date or datetime (UTC), open, high, low, close, volume. Bars with a date already stored are replaced.
          </p>
          {result ? (
            <div data-testid="import-result" className="space-y-1 rounded-lg border border-border p-3 text-sm">
              <p>
                {result.added} added, {result.updated} updated, {result.skipped} skipped
              </p>
              {result.errors.length > 0 ? (
                <ul className="list-inside list-disc text-muted-foreground">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${s.ticker}?`}
          confirmLabel="Delete"
          destructive
          pending={deleting}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        >
          Its price history, and every alert, saved chart and paper order on it, are deleted for everyone.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value, testId, className }: { label: string; value: string; testId: string; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className={`mt-1 text-xl font-semibold tabular-nums ${className ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}
