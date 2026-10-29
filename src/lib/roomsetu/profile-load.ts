/**
 * Load state for the profile form. Save must stay blocked until the saved
 * profile has loaded, or an early tap would overwrite stored details with the
 * empty defaults the form starts with.
 */
export type LoadState =
  | { kind: "loading" }
  | { kind: "loaded" }
  | { kind: "failed"; reason: string };

export const LOADING_LABEL = "Loading profile…";

export function canSave(load: LoadState): boolean {
  return load.kind === "loaded";
}

export function formLocked(load: LoadState): boolean {
  return load.kind !== "loaded";
}

/** Button label: load state wins over the save label. */
export function saveButtonLabelFor(load: LoadState, saveLabel: string): string {
  if (load.kind === "loading") return LOADING_LABEL;
  if (load.kind === "failed") return "Can't save yet";
  return saveLabel;
}

export function loadErrorMessage(reason: string): string {
  const r = reason.trim();
  return r
    ? `Couldn't load your profile: ${r}. Tap retry, your saved details are safe.`
    : "Couldn't load your profile. Check your connection and tap retry, your saved details are safe.";
}
