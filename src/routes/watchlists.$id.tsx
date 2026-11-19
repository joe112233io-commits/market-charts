import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronLeft, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { Button } from "@/client/components/ui/button";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { errorMessage, pct, price, signed, tone, volume } from "@/client/lib/format";
import { useSorted } from "@/client/lib/sort";
import {
  addItemFn,
  deleteWatchlistFn,
  getWatchlistFn,
  removeItemFn,
  renameWatchlistFn,
  reorderItemsFn,
} from "@/serverFunctions/lists";
import { listSymbolsFn } from "@/serverFunctions/market";

export const Route = createFileRoute("/watchlists/$id")({
  loader: async ({ params }) => ({
    list: await getWatchlistFn({ data: { id: params.id } }),
    symbols: await listSymbolsFn(),
  }),
  component: WatchlistPage,
  errorComponent: RouteError,
});

function WatchlistPage() {
  const { list, symbols } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { watchlist, items } = list;
  const { sorted, sort, setSort, column } = useSorted(items);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const available = symbols.filter((s) => !items.some((i) => i.symbolId === s.id));

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((i) => i.symbolId);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    setSort(null);
    return act(() => reorderItemsFn({ data: { id: watchlist.id, symbolIds: ids } }));
  };

  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/watchlists" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden /> Watchlists
          </Link>
        }
        title={watchlist.name}
        actions={
          <>
            <Button variant="outline" onClick={() => setRenaming(true)}>Rename</Button>
            <Button variant="outline" onClick={() => setDeleting(true)}>Delete</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          testId="add-symbol-select"
          label="Symbol to add"
          className="w-44"
          placeholder="Choose a symbol"
          value={adding}
          onChange={setAdding}
          options={available.map((s) => ({ value: s.id, label: s.ticker }))}
        />
        <Button
          disabled={!adding}
          pending={busy && !!adding}
          onClick={() =>
            act(async () => {
              await addItemFn({ data: { id: watchlist.id, symbolId: adding! } });
              setAdding(null);
            })
          }
        >
          Add to list
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="This list is empty" />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortableHeader column={column("ticker")} label="Symbol" /></TableHead>
                <TableHead className="text-right"><SortableHeader column={column("last")} label="Last" align="right" /></TableHead>
                <TableHead className="text-right"><SortableHeader column={column("change")} label="Change" align="right" /></TableHead>
                <TableHead className="text-right"><SortableHeader column={column("changePct")} label="Change %" align="right" /></TableHead>
                <TableHead className="hidden text-right sm:table-cell"><SortableHeader column={column("volume")} label="Volume" align="right" /></TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => {
                const index = items.findIndex((i) => i.symbolId === item.symbolId);
                return (
                  <TableRow
                    key={item.symbolId}
                    data-testid={`watch-row-${item.ticker}`}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/chart", search: { symbol: item.symbolId } })}
                  >
                    <TableCell>
                      <div className="font-medium">{item.ticker}</div>
                      <div className="max-w-48 truncate text-xs text-muted-foreground">{item.name}</div>
                    </TableCell>
                    <TableCell data-testid="watch-last" className="text-right tabular-nums">{price(item.last)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${tone(item.change)}`}>{signed(item.change)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${tone(item.changePct)}`}>{pct(item.changePct)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{volume(item.volume)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {sort ? null : (
                        <>
                          <Button variant="ghost" size="icon-xs" aria-label={`Move ${item.ticker} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                            <ArrowUp />
                          </Button>
                          <Button variant="ghost" size="icon-xs" aria-label={`Move ${item.ticker} down`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>
                            <ArrowDown />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${item.ticker}`}
                        disabled={busy}
                        onClick={() => act(() => removeItemFn({ data: { id: watchlist.id, symbolId: item.symbolId } }))}
                      >
                        <X />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {renaming ? (
        <NameDialog
          title="Rename watchlist"
          initial={watchlist.name}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            await renameWatchlistFn({ data: { id: watchlist.id, name } });
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete "${watchlist.name}"?`}
          confirmLabel="Delete"
          destructive
          pending={busy}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            act(async () => {
              await deleteWatchlistFn({ data: { id: watchlist.id } });
              await navigate({ to: "/watchlists" });
            })
          }
        />
      ) : null}
    </AppShell>
  );
}
