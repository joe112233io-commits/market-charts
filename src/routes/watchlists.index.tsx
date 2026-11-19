import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RouteError } from "@/client/components/RouteError";
import { Button } from "@/client/components/ui/button";
import { createWatchlistFn, listWatchlistsFn } from "@/serverFunctions/lists";

export const Route = createFileRoute("/watchlists/")({
  loader: () => listWatchlistsFn(),
  component: WatchlistsPage,
  errorComponent: RouteError,
});

function WatchlistsPage() {
  const lists = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus /> New watchlist
    </Button>
  );
  return (
    <AppShell>
      <PageHeader title="Watchlists" actions={newButton} />
      {lists.length === 0 ? (
        <EmptyState title="No watchlists yet" description="Create one and it will appear here." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <li key={l.id}>
              <Link
                to="/watchlists/$id"
                params={{ id: l.id }}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="font-medium">{l.name}</div>
                <div className="text-sm text-muted-foreground">
                  {l.count} {l.count === 1 ? "symbol" : "symbols"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <NameDialog
          title="New watchlist"
          initial=""
          submitLabel="Create"
          onClose={() => setCreating(false)}
          onSave={async (name) => {
            const created = await createWatchlistFn({ data: { name } });
            await navigate({ to: "/watchlists/$id", params: { id: created.id } });
          }}
        />
      ) : null}
    </AppShell>
  );
}
