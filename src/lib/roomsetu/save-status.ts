export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; reason: string };

export const SAVED_HIDE_MS = 5000;
export const SAVED_MESSAGE = "Profile saved ✓ you're all set";

export function saveButtonLabel(s: SaveStatus): string {
  return s.kind === "saving" ? "Saving…" : "Save profile";
}

export function isSaving(s: SaveStatus): boolean {
  return s.kind === "saving";
}

export function saveErrorMessage(reason: string): string {
  const r = reason.trim();
  return r ? `Oops, couldn't save that: ${r}` : "Oops, couldn't save that. Check your connection and try again.";
}

/** Text for the aria-live status line; empty when nothing to say. */
export function saveStatusText(s: SaveStatus): string {
  if (s.kind === "saved") return SAVED_MESSAGE;
  if (s.kind === "error") return saveErrorMessage(s.reason);
  return "";
}

/**
 * The "saved" confirmation lives OUTSIDE the component so it survives the
 * profile page remounting or refetching right after a save (session refresh,
 * auth gate flipping to its loading view, the load effect re-running). Before,
 * the flag lived only in component state, so any remount or reload after the
 * save silently dropped it back to idle and the message never showed.
 */
let savedAt = 0;

export function markSaved(now: number = Date.now()): void {
  savedAt = now;
}

export function clearSaved(): void {
  savedAt = 0;
}

/** ms left to show the confirmation (0 = hidden). */
export function savedRemainingMs(now: number = Date.now()): number {
  if (!savedAt) return 0;
  const left = savedAt + SAVED_HIDE_MS - now;
  return left > 0 ? left : 0;
}

/** Initial status for a (re)mounted profile page. */
export function initialSaveStatus(now: number = Date.now()): SaveStatus {
  return savedRemainingMs(now) > 0 ? { kind: "saved" } : { kind: "idle" };
}

