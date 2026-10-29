export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; reason: string };

export const SAVED_HIDE_MS = 3500;
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
