/**
 * Load state for signed-in lists (/applications, /saved). Pure, no React.
 * A list is only "empty" once the fetch has actually come back with zero rows,
 * so a slow or failed fetch never looks like "No requests yet".
 */
export type ListLoad<T> =
  | { kind: "loading" }
  | { kind: "failed"; reason: string }
  | { kind: "loaded"; items: T[]; refreshError?: string };

export type ListView = "loading" | "error" | "empty" | "populated";

export function listView<T>(s: ListLoad<T>): ListView {
  if (s.kind === "loading") return "loading";
  if (s.kind === "failed") return "error";
  return s.items.length ? "populated" : "empty";
}

/** Rows to render: none until loaded. */
export function listItems<T>(s: ListLoad<T>): T[] {
  return s.kind === "loaded" ? s.items : [];
}

/** Starting a fetch: first load (or a retry after failure) shows loading; a refresh keeps what's on screen. */
export function startLoad<T>(prev: ListLoad<T>): ListLoad<T> {
  return prev.kind === "loaded" ? prev : { kind: "loading" };
}

export type LoadOutcome<T> = { ok: true; items: T[] } | { ok: false; reason: string };

/** A failed refresh keeps the rows and flags the error; a failed first load becomes the error state. */
export function finishLoad<T>(prev: ListLoad<T>, outcome: LoadOutcome<T>): ListLoad<T> {
  if (outcome.ok) return { kind: "loaded", items: outcome.items };
  if (prev.kind === "loaded") return { kind: "loaded", items: prev.items, refreshError: outcome.reason };
  return { kind: "failed", reason: outcome.reason };
}

/** Runs one fetch through start → finish. `isLive` drops results that land after unmount. */
export async function runListLoad<T>(
  fetcher: () => Promise<T[]>,
  update: (fn: (prev: ListLoad<T>) => ListLoad<T>) => void,
  toReason: (e: unknown) => string,
  isLive: () => boolean = () => true,
): Promise<void> {
  update(startLoad);
  let outcome: LoadOutcome<T>;
  try {
    outcome = { ok: true, items: await fetcher() };
  } catch (e) {
    outcome = { ok: false, reason: toReason(e) };
  }
  if (isLive()) update((prev) => finishLoad(prev, outcome));
}

/** "Couldn't load your requests: <reason>. Tap retry." Never reads like an empty list. */
export function listErrorMessage(what: string, reason: string): string {
  const r = reason.trim().replace(/\.$/, "");
  return r ? `Couldn't load your ${what}: ${r}. Tap retry.` : `Couldn't load your ${what}. Check your connection and tap retry.`;
}
