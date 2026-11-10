import type { ReactNode } from "react";
import { btnSmall, errorBox, skeleton } from "@/components/ui-tokens";
import { listErrorMessage, listView, type ListLoad } from "@/lib/ui/list-load";

/**
 * Loading / error-with-retry / empty for a signed-in list. Renders nothing once rows are in
 * (except a small banner when a background refresh failed).
 */
export function ListStatus<T>({ state, what, empty, onRetry, rows = 3, rowClass = "h-24" }: {
  state: ListLoad<T>;
  what: string;
  empty: ReactNode;
  onRetry: () => void;
  rows?: number;
  rowClass?: string;
}) {
  const view = listView(state);
  if (view === "loading")
    return (
      <div className="mt-6 space-y-3" aria-busy="true" aria-live="polite" data-testid="list-loading">
        <span className="sr-only">Loading your {what}…</span>
        {Array.from({ length: rows }, (_, i) => <div key={i} className={`${skeleton} ${rowClass} w-full rounded-3xl`} aria-hidden="true" />)}
      </div>
    );
  if (view === "error" && state.kind === "failed")
    return (
      <div className={`mt-6 ${errorBox}`} role="alert" data-testid="list-error">
        <p>{listErrorMessage(what, state.reason)}</p>
        <button type="button" className={`mt-3 ${btnSmall}`} onClick={onRetry} data-testid="list-retry">Retry</button>
      </div>
    );
  if (view === "empty") return <div className="mt-4 text-muted" data-testid="list-empty">{empty}</div>;
  if (state.kind === "loaded" && state.refreshError)
    return (
      <p className={`mt-3 ${errorBox}`} role="alert" data-testid="list-refresh-error">
        {listErrorMessage(what, state.refreshError)}{" "}
        <button type="button" className="underline" onClick={onRetry}>Retry</button>
      </p>
    );
  return null;
}
