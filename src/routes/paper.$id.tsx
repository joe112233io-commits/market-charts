import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { dateTime, errorMessage, money, price, tone } from "@/client/lib/format";
import { listSymbolsFn } from "@/serverFunctions/market";
import { cancelOrderFn, deleteAccountFn, getAccountFn, placeOrderFn, resetAccountFn } from "@/serverFunctions/trading";

export const Route = createFileRoute("/paper/$id")({
  loader: async ({ params }) => ({
    data: await getAccountFn({ data: { id: params.id } }),
    symbols: await listSymbolsFn(),
  }),
  component: AccountPage,
  errorComponent: RouteError,
});

const STATUS: Record<string, string> = { working: "Working", filled: "Filled", cancelled: "Cancelled", rejected: "Rejected" };
const TYPES = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
  { value: "stop", label: "Stop" },
] as const;

function AccountPage() {
  const { data, symbols } = Route.useLoaderData();
  const { account, positions, orders, summary } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const [symbolId, setSymbolId] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit" | "stop">("market");
  const [qty, setQty] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);

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

  const place = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbolId) return;
    void act(async () => {
      const order = await placeOrderFn({
        data: {
          accountId: account.id,
          order: { symbolId, side, type, qty: Number(qty), ...(type === "market" ? {} : { price: Number(orderPrice) }) },
        },
      });
      if (order.status === "rejected") toast.error(`Rejected: ${order.reason}`);
      else if (order.status === "filled") toast.success(`Filled at ${price(order.filledPrice)}`);
      else toast.success("Order working");
    });
  };

  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/paper" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden /> Paper trading
          </Link>
        }
        title={account.name}
        description={`Started with ${money(account.startingBalance, account.currency)} · ${account.commissionPct}% commission`}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm("reset")}>Reset account</Button>
            <Button variant="outline" onClick={() => setConfirm("delete")}>Delete</Button>
          </>
        }
      />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Equity" testId="acct-equity" value={money(summary.equity)} />
        <Stat label="Cash" testId="acct-cash" value={money(account.cash)} />
        <Stat label="Market value" testId="acct-market-value" value={money(summary.marketValue)} />
        <Stat label="Unrealized P&L" testId="acct-unrealized" value={money(summary.unrealizedPnl)} className={tone(summary.unrealizedPnl)} />
        <Stat label="Realized P&L" testId="acct-realized" value={money(summary.realizedPnl)} className={tone(summary.realizedPnl)} />
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>New order</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={place} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="order-symbol">Symbol</Label>
              <SimpleSelect
                id="order-symbol"
                testId="order-symbol"
                className="w-36"
                placeholder="Choose"
                value={symbolId}
                onChange={setSymbolId}
                options={symbols.map((s) => ({ value: s.id, label: s.ticker }))}
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Side</span>
              <ToggleGroup
                variant="outline"
                value={[side]}
                onValueChange={(v: string[]) => {
                  if (v[0]) setSide(v[0] as "buy" | "sell");
                }}
              >
                <ToggleGroupItem value="buy">Buy</ToggleGroupItem>
                <ToggleGroupItem value="sell">Sell</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="order-type">Type</Label>
              <SimpleSelect id="order-type" testId="order-type" className="w-28" value={type} onChange={setType} options={TYPES} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="order-qty">Quantity</Label>
              <Input id="order-qty" className="w-28" type="number" min="0" step="any" required value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            {type !== "market" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="order-price">Price</Label>
                <Input id="order-price" className="w-32" type="number" min="0" step="any" required value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} />
              </div>
            ) : null}
            <Button type="submit" disabled={!symbolId} pending={busy}>
              Place order
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Positions</h2>
        {positions.length === 0 ? (
          <EmptyState variant="plain" size="sm" title="No open positions" />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Avg. price</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                  <TableHead className="text-right">Market value</TableHead>
                  <TableHead className="text-right">Unrealized P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p) => (
                  <TableRow key={p.symbolId} data-testid={`position-row-${p.ticker}`}>
                    <TableCell className="font-medium">{p.ticker}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{price(p.avgPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{price(p.last)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.marketValue)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${tone(p.unrealizedPnl)}`}>{money(p.unrealizedPnl)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Orders</h2>
        {orders.length === 0 ? (
          <EmptyState variant="plain" size="sm" title="No orders yet" />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placed</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Fill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} data-testid="order-row" data-status={o.status}>
                    <TableCell className="text-muted-foreground">{dateTime(o.createdAt)}</TableCell>
                    <TableCell>
                      <span className={o.side === "buy" ? "text-success" : "text-destructive"}>{o.side === "buy" ? "Buy" : "Sell"}</span> {o.qty}{" "}
                      {o.ticker} · {TYPES.find((t) => t.value === o.type)?.label}
                      {o.price != null ? ` @ ${price(o.price)}` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{o.filledPrice != null ? price(o.filledPrice) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "rejected" ? "destructive" : o.status === "working" ? "default" : "secondary"}>{STATUS[o.status]}</Badge>
                      {o.reason ? <div className="text-xs text-muted-foreground">{o.reason}</div> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {o.status === "working" ? (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => cancelOrderFn({ data: { accountId: account.id, orderId: o.id } }))}>
                          Cancel
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      {confirm === "reset" ? (
        <ConfirmDialog
          title="Reset this account?"
          confirmLabel="Reset"
          destructive
          pending={busy}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await act(() => resetAccountFn({ data: { id: account.id } }));
            setConfirm(null);
          }}
        >
          Positions and order history are cleared and cash goes back to {money(account.startingBalance, account.currency)}.
        </ConfirmDialog>
      ) : null}
      {confirm === "delete" ? (
        <ConfirmDialog
          title={`Delete "${account.name}"?`}
          confirmLabel="Delete"
          destructive
          pending={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            act(async () => {
              await deleteAccountFn({ data: { id: account.id } });
              await navigate({ to: "/paper" });
            })
          }
        />
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value, testId, className }: { label: string; value: string; testId: string; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className={`mt-1 font-semibold tabular-nums ${className ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}
