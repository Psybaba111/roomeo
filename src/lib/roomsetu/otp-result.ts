/** Phone OTP verify outcome, shared by the server fn and the /verification UI. Pure so it can be unit tested. */
export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "too_many" | "no_code" }
  | { ok: false; reason: "wrong"; triesLeft: number };

/** Classify a failed attempt. `row` is the pending OTP (or null if none), read after the attempt was counted. */
export function classifyOtpFailure(
  row: { expired: boolean; attempts: number } | null,
  matched: boolean,
  maxAttempts: number,
): VerifyOtpResult {
  if (matched) return { ok: true };
  if (!row) return { ok: false, reason: "no_code" };
  if (row.expired) return { ok: false, reason: "expired" };
  const triesLeft = Math.max(0, maxAttempts - row.attempts);
  if (triesLeft === 0) return { ok: false, reason: "too_many" };
  return { ok: false, reason: "wrong", triesLeft };
}

export type VerifyMessage = { text: string; tone: "success" | "error" };

export function verifyOtpMessage(r: VerifyOtpResult): VerifyMessage {
  if (r.ok) return { text: "Phone verified ✓", tone: "success" };
  switch (r.reason) {
    case "expired":
      return { text: "Code expired, tap Resend", tone: "error" };
    case "too_many":
      return { text: "Too many tries. Tap Resend for a new code.", tone: "error" };
    case "no_code":
      return { text: "No active code. Tap Resend", tone: "error" };
    case "wrong":
      return { text: `Wrong code, ${r.triesLeft} ${r.triesLeft === 1 ? "try" : "tries"} left`, tone: "error" };
  }
}

export const RESEND_COOLDOWN_SECONDS = 30;

/** Seconds until Resend is allowed again, from the last send time. */
export function resendSecondsLeft(lastSentAt: number | null, now: number, cooldown = RESEND_COOLDOWN_SECONDS): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, Math.ceil(cooldown - (now - lastSentAt) / 1000));
}
