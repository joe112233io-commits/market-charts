import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { barTime, dateTime, errorMessage, price } from "@/client/lib/format";
import { ALERT_CONDITION_LABELS, ALERT_CONDITIONS, isChannel, type AlertCondition } from "@/lib/market";
import { listSymbolsFn } from "@/serverFunctions/market";
import { createAlertFn, deleteAlertFn, getAlertsFn, pauseAlertFn, updateAlertFn } from "@/serverFunctions/trading";

export const Route = createFileRoute("/alerts")({
  validateSearch: (s) => z.object({ symbol: z.string().optional() }).parse(s),
  loader: async () => ({ ...(await getAlertsFn()), symbols: await listSymbolsFn() }),
  component: AlertsPage,
  errorComponent: RouteError,
});

type Alert = ReturnType<typeof Route.useLoaderData>["alerts"][number];

const STATUS_LABELS: Record<string, string> = { active: "Active", paused: "Paused", triggered: "Triggered", expired: "Expired" };

function describe(a: { condition: string; value: number; value2: number | null }) {
  const label = ALERT_CONDITION_LABELS[a.condition as AlertCondition];
  if (isChannel(a.condition as AlertCondition)) return `${label} ${price(a.value)} – ${price(a.value2)}`;
  if (a.condition.endsWith("_pct")) return `${label.replace(" %", "")} ${a.value}%`;
  return `${label} ${price(a.value)}`;
}

function AlertsPage() {
  const { alerts, events, symbols } = Route.useLoaderData();
  const { symbol } = Route.useSearch();
  const router = useRouter();
  const [editing, setEditing] = useState<Alert | "new" | null>(symbol ? "new" : null);
  const [deleting, setDeleting] = useState<Alert | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await work();
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const groups = {
    active: alerts.filter((a) => a.status === "active" || a.status === "paused"),
    triggered: alerts.filter((a) => a.status === "triggered"),
    expired: alerts.filter((a) => a.status === "expired"),
  };

  const table = (rows: Alert[], empty: string) =>
    rows.length === 0 ? (
      <EmptyState variant="plain" size="sm" title={empty} />
    ) : (
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="hidden md:table-cell">Message</TableHead>
              <TableHead className="hidden sm:table-cell">Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id} data-testid="alert-row" data-status={a.status}>
                <TableCell className="font-medium">{a.ticker}</TableCell>
                <TableCell>
                  {describe(a)}
                  <div className="text-xs text-muted-foreground">
                    {a.frequency === "once" ? "Once" : "Once per bar"}
                    {a.notifyEmail ? " · email" : ""}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-64 truncate md:table-cell">{a.message}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{a.expiresAt ? dateTime(a.expiresAt) : "Never"}</TableCell>
                <TableCell>
                  <Badge variant={a.status === "active" ? "default" : "secondary"}>{STATUS_LABELS[a.status]}</Badge>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {a.status === "active" ? (
                    <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={() => act(a.id, () => pauseAlertFn({ data: { id: a.id, paused: true } }))}>
                      Pause
                    </Button>
                  ) : null}
                  {a.status === "paused" ? (
                    <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={() => act(a.id, () => pauseAlertFn({ data: { id: a.id, paused: false } }))}>
                      Resume
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(a)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    );

  return (
    <AppShell>
      <PageHeader
        title="Alerts"
        actions={
          <Button onClick={() => setEditing("new")} disabled={symbols.length === 0}>
            <Plus /> New alert
          </Button>
        }
      />
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({groups.active.length})</TabsTrigger>
          <TabsTrigger value="triggered">Triggered ({groups.triggered.length})</TabsTrigger>
          <TabsTrigger value="expired">Expired ({groups.expired.length})</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="active">{table(groups.active, "No active alerts")}</TabsContent>
        <TabsContent value="triggered">{table(groups.triggered, "No triggered alerts")}</TabsContent>
        <TabsContent value="expired">{table(groups.expired, "No expired alerts")}</TabsContent>
        <TabsContent value="log">
          {events.length === 0 ? (
            <EmptyState variant="plain" size="sm" title="Nothing has fired yet" description="Alerts are checked whenever new bars arrive." />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                    <TableHead className="hidden sm:table-cell">Bar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id} data-testid="alert-event">
                      <TableCell className="font-medium">{e.ticker}</TableCell>
                      <TableCell>{e.message}</TableCell>
                      <TableCell className="text-right tabular-nums">{price(e.price)}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{barTime(e.barTime)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </TabsContent>
      </Tabs>
      {editing ? (
        <AlertDialog
          alert={editing === "new" ? null : editing}
          symbols={symbols}
          initialSymbol={symbol}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete the ${deleting.ticker} alert?`}
          confirmLabel="Delete"
          destructive
          pending={busy === deleting.id}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await act(deleting.id, () => deleteAlertFn({ data: { id: deleting.id } }));
            setDeleting(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function AlertDialog({
  alert,
  symbols,
  initialSymbol,
  onClose,
  onSaved,
}: {
  alert: Alert | null;
  symbols: { id: string; ticker: string; last: number | null }[];
  initialSymbol?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const startSymbol = alert?.symbolId ?? (symbols.some((s) => s.id === initialSymbol) ? initialSymbol! : symbols[0]!.id);
  const [symbolId, setSymbolId] = useState(startSymbol);
  const [condition, setCondition] = useState<AlertCondition>((alert?.condition as AlertCondition) ?? "crossing");
  const [value, setValue] = useState(alert ? String(alert.value) : String(symbols.find((s) => s.id === startSymbol)?.last ?? ""));
  const [value2, setValue2] = useState(alert?.value2 != null ? String(alert.value2) : "");
  const [frequency, setFrequency] = useState<"once" | "once_per_bar">((alert?.frequency as "once") ?? "once");
  const [expires, setExpires] = useState(toLocalInput(alert?.expiresAt ?? null));
  const [message, setMessage] = useState(alert?.message ?? "");
  const [email, setEmail] = useState(alert?.notifyEmail ?? false);
  const [pending, setPending] = useState(false);
  const channel = isChannel(condition);
  const pctCondition = condition.endsWith("_pct");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const fields = {
      condition,
      value: Number(value),
      value2: channel ? Number(value2) : null,
      frequency,
      expiresAt: expires ? new Date(expires).toISOString() : null,
      message,
      notifyEmail: email,
    };
    try {
      if (alert) await updateAlertFn({ data: { id: alert.id, symbolId, ...fields } });
      else await createAlertFn({ data: { symbolId, ...fields } });
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  };

  return (
    <FormDialog
      title={alert ? "Edit alert" : "New alert"}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="alert-form" pending={pending}>
            {alert ? "Save alert" : "Create alert"}
          </Button>
        </>
      }
    >
      <form id="alert-form" onSubmit={submit} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="alert-symbol">Symbol</Label>
            <SimpleSelect id="alert-symbol" testId="alert-symbol" value={symbolId} onChange={setSymbolId} options={symbols.map((s) => ({ value: s.id, label: s.ticker }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="alert-condition">Condition</Label>
            <SimpleSelect
              id="alert-condition"
              testId="alert-condition"
              value={condition}
              onChange={setCondition}
              options={ALERT_CONDITIONS.map((c) => ({ value: c, label: ALERT_CONDITION_LABELS[c] }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="alert-value">{channel ? "Lower value" : pctCondition ? "Percent" : "Value"}</Label>
            <Input id="alert-value" type="number" step="any" required value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          {channel ? (
            <div className="grid gap-1.5">
              <Label htmlFor="alert-value2">Upper value</Label>
              <Input id="alert-value2" type="number" step="any" required value={value2} onChange={(e) => setValue2(e.target.value)} />
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="alert-frequency">Trigger</Label>
            <SimpleSelect
              id="alert-frequency"
              testId="alert-frequency"
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "once", label: "Once" },
                { value: "once_per_bar", label: "Once per bar" },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="alert-expires">Expires</Label>
            <Input id="alert-expires" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="alert-message">Message</Label>
          <Input id="alert-message" value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} /> Also email me
        </Label>
      </form>
    </FormDialog>
  );
}
