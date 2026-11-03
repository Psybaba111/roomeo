// Inbox helpers. Pure, testable.

/** How often the thread list refreshes so new conversations show up without a reload. */
export const THREAD_POLL_MS = 5000;

/** "r***@gmail.com" so people with several accounts can see which one they are in. */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "";
  return `${e[0]}***${e.slice(at)}`;
}

/** Line shown at the top of Messages naming the signed-in account. */
export function signedInLine(name: string | null | undefined, email: string | null | undefined): string {
  const masked = maskEmail(email);
  const who = (name ?? "").trim();
  if (!who && !masked) return "";
  return `Signed in as ${[who, masked].filter(Boolean).join(" · ")}. Only messages for this account show here.`;
}
