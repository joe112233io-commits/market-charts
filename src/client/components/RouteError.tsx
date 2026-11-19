import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { ErrorState } from "@/client/components/ErrorState";
import { Button } from "@/client/components/ui/button";
import { errorMessage } from "@/client/lib/format";

/** A page's failure: "not found" for an object that isn't the member's, else the error. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const message = errorMessage(error);
  return (
    <AppShell>
      {/not found/i.test(message) ? (
        <div data-testid="not-found">
          <EmptyState
            kind="filtered"
            title="Not found"
            action={<Button nativeButton={false} render={<Link to="/" />} variant="outline">Back to symbols</Button>}
          />
        </div>
      ) : (
        <ErrorState message={message} onRetry={reset} variant="page" />
      )}
    </AppShell>
  );
}
