/** Client-side checks for the change-password form. Returns a friendly error, or "" when OK. */
export const MIN_PASSWORD = 8;

export function checkNewPassword(current: string, next: string, confirm: string): string {
  if (!current) return "Pop in your current password first.";
  if (next.length < MIN_PASSWORD) return `New password needs at least ${MIN_PASSWORD} characters.`;
  if (next.length > 128) return "That's a bit too long. Keep it under 128 characters.";
  if (next === current) return "New password can't be the same as your current one.";
  if (next !== confirm) return "Passwords don't match. Try typing them again.";
  return "";
}

/** Map better-auth error codes/messages to casual copy. */
export function changePasswordErrorText(err: { code?: string; message?: string } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  if (code === "INVALID_PASSWORD" || msg.includes("invalid password")) return "Current password isn't right. Double-check and try again.";
  if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND" || msg.includes("credential account"))
    return "You signed in with Google or X, so there's no Roomeo password to change here.";
  if (code === "PASSWORD_TOO_SHORT") return `New password needs at least ${MIN_PASSWORD} characters.`;
  if (code === "PASSWORD_TOO_LONG") return "That's a bit too long. Keep it under 128 characters.";
  if (msg.includes("session")) return "Your session expired. Sign in again and retry.";
  return "Couldn't change your password. Try again in a sec.";
}
