/** True when a listing row should 404: missing, REMOVED, or its owner is suspended. */
export function listingGone(row: { status?: unknown; account_status?: unknown } | undefined | null): boolean {
  if (!row) return true;
  return String(row.status ?? "") === "REMOVED" || String(row.account_status ?? "") === "SUSPENDED";
}

/** Ids that can't be a listing id; these should 404 too rather than error. */
export function badListingId(input: unknown): boolean {
  return typeof input !== "string" || !/^[0-9a-f-]{8,80}$/i.test(input);
}
