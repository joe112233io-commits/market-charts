import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage, money, tone } from "@/client/lib/format";
import { createAccountFn, listAccountsFn } from "@/serverFunctions/trading";

export const Route = createFileRoute("/paper/")({
  loader: () => listAccountsFn(),
  component: PaperPage,
  errorComponent: RouteError,
});

function PaperPage() {
  const accounts = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  return (
    <AppShell>
      <PageHeader
        title="Paper trading"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New account
          </Button>
        }
      />
      {accounts.length === 0 ? (
        <EmptyState title="No accounts yet" description="Open an account with a virtual balance to place practice orders." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const pnl = a.equity - a.startingBalance;
            return (
              <li key={a.id}>
                <Link to="/paper/$id" params={{ id: a.id }} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent">
                  <div className="font-medium">{a.name}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{money(a.equity, a.currency)}</div>
                  <div className={`text-sm tabular-nums ${tone(pnl)}`}>
                    {pnl >= 0 ? "+" : ""}
                    {money(pnl)} since start
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {creating ? <NewAccountDialog onClose={() => setCreating(false)} /> : null}
    </AppShell>
  );
}

function NewAccountDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", startingBalance: "100000", currency: "USD", commissionPct: "0" });
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <FormDialog
      title="New account"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="account-form" pending={pending}>Open account</Button>
        </>
      }
    >
      <form
        id="account-form"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            const a = await createAccountFn({
              data: {
                name: form.name,
                startingBalance: Number(form.startingBalance),
                currency: form.currency,
                commissionPct: Number(form.commissionPct),
              },
            });
            await navigate({ to: "/paper/$id", params: { id: a.id } });
          } catch (error) {
            toast.error(errorMessage(error));
            setPending(false);
          }
        }}
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="acct-name">Name</Label>
          <Input id="acct-name" required maxLength={80} value={form.name} onChange={set("name")} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acct-balance">Starting balance</Label>
          <Input id="acct-balance" type="number" min="1" step="any" required value={form.startingBalance} onChange={set("startingBalance")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acct-currency">Currency</Label>
          <Input id="acct-currency" required minLength={3} maxLength={5} value={form.currency} onChange={set("currency")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acct-commission">Commission %</Label>
          <Input id="acct-commission" type="number" min="0" max="10" step="any" required value={form.commissionPct} onChange={set("commissionPct")} />
        </div>
      </form>
    </FormDialog>
  );
}
