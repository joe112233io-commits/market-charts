import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { errorMessage, pct, price, tone, volume } from "@/client/lib/format";
import { useSorted } from "@/client/lib/sort";
import { ASSET_TYPE_LABELS, ASSET_TYPES, type AssetType } from "@/lib/market";
import { createSymbolFn, listSymbolsFn } from "@/serverFunctions/market";

export const Route = createFileRoute("/")({
  loader: () => listSymbolsFn(),
  component: SymbolsPage,
  errorComponent: RouteError,
});

const TYPE_OPTIONS = ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_LABELS[t] }));

function SymbolsPage() {
  const symbols = Route.useLoaderData();
  const [adding, setAdding] = useState(false);
  const { sorted, column } = useSorted(symbols);
  return (
    <AppShell>
      <PageHeader
        title="Symbols"
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add symbol
          </Button>
        }
      />
      {symbols.length === 0 ? (
        <EmptyState
          title="No symbols yet"
          description="Add a symbol, then import its price history from a CSV file."
          action={<Button onClick={() => setAdding(true)}>Add symbol</Button>}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortableHeader column={column("ticker")} label="Ticker" /></TableHead>
                <TableHead className="hidden md:table-cell"><SortableHeader column={column("name")} label="Name" /></TableHead>
                <TableHead className="hidden md:table-cell"><SortableHeader column={column("exchange")} label="Exchange" /></TableHead>
                <TableHead className="hidden sm:table-cell"><SortableHeader column={column("assetType")} label="Type" /></TableHead>
                <TableHead className="text-right"><SortableHeader column={column("last")} label="Last" align="right" /></TableHead>
                <TableHead className="text-right"><SortableHeader column={column("changePct")} label="Change %" align="right" /></TableHead>
                <TableHead className="hidden text-right sm:table-cell"><SortableHeader column={column("volume")} label="Volume" align="right" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.id} data-testid={`symbol-row-${s.ticker}`}>
                  <TableCell className="font-medium">
                    <Link to="/symbols/$symbolId" params={{ symbolId: s.id }} className="hover:underline">
                      {s.ticker}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate md:table-cell">{s.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{s.exchange}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary">{ASSET_TYPE_LABELS[s.assetType as AssetType] ?? s.assetType}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{price(s.last)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${tone(s.changePct)}`}>{pct(s.changePct)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{volume(s.volume)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {adding ? <AddSymbolDialog onClose={() => setAdding(false)} /> : null}
    </AppShell>
  );
}

function AddSymbolDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [form, setForm] = useState({ ticker: "", name: "", exchange: "", currency: "USD" });
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const created = await createSymbolFn({ data: { ...form, assetType } });
      await router.invalidate();
      await navigate({ to: "/symbols/$symbolId", params: { symbolId: created.id } });
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  };
  return (
    <FormDialog
      title="Add symbol"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-symbol" pending={pending}>Add</Button>
        </>
      }
    >
      <form id="add-symbol" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="sym-ticker">Ticker</Label>
          <Input id="sym-ticker" value={form.ticker} onChange={set("ticker")} required maxLength={20} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sym-exchange">Exchange</Label>
          <Input id="sym-exchange" value={form.exchange} onChange={set("exchange")} required maxLength={40} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="sym-name">Name</Label>
          <Input id="sym-name" value={form.name} onChange={set("name")} required maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sym-type">Asset type</Label>
          <SimpleSelect id="sym-type" testId="asset-type" value={assetType} onChange={setAssetType} options={TYPE_OPTIONS} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sym-currency">Currency</Label>
          <Input id="sym-currency" value={form.currency} onChange={set("currency")} required minLength={3} maxLength={5} />
        </div>
      </form>
    </FormDialog>
  );
}
