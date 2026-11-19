import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CandlestickChart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { Button } from "@/client/components/ui/button";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { dateTime, errorMessage } from "@/client/lib/format";
import { CHART_TYPE_LABELS, type ChartType } from "@/lib/chart";
import { deleteLayoutFn, listLayoutsFn, renameLayoutFn } from "@/serverFunctions/lists";

export const Route = createFileRoute("/layouts")({
  loader: () => listLayoutsFn(),
  component: LayoutsPage,
  errorComponent: RouteError,
});

function LayoutsPage() {
  const layouts = Route.useLoaderData();
  const router = useRouter();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <AppShell>
      <PageHeader
        title="Charts"
        actions={
          <Button nativeButton={false} render={<Link to="/chart" />}>
            <CandlestickChart /> New chart
          </Button>
        }
      />
      {layouts.length === 0 ? (
        <EmptyState
          title="No saved layouts"
          description="Save a chart as a layout and it will appear here."
          action={<Button nativeButton={false} render={<Link to="/chart" />}>Open a chart</Button>}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="hidden sm:table-cell">Setup</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {layouts.map((l) => (
                <TableRow key={l.id} data-testid="layout-row">
                  <TableCell className="font-medium">
                    <Link to="/chart" search={{ layout: l.id }} className="hover:underline">
                      {l.name}
                    </Link>
                  </TableCell>
                  <TableCell>{l.ticker}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {l.interval} · {CHART_TYPE_LABELS[l.chartType as ChartType]} · {l.indicatorCount} indicators · {l.drawingCount} drawings
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{dateTime(l.updatedAt)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setRenaming(l)}>Rename</Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(l)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {renaming ? (
        <NameDialog
          title="Rename layout"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await renameLayoutFn({ data: { id: renaming.id, name } });
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setPending(true);
            try {
              await deleteLayoutFn({ data: { id: deleting.id } });
              await router.invalidate();
            } catch (error) {
              toast.error(errorMessage(error));
            }
            setPending(false);
            setDeleting(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}
