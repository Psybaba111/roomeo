// Inline phone verify for chat. Pure, testable.

/** The exact server message when a seeker's phone isn't verified yet (pricing-db grantContact). */
export const NEED_PHONE_MESSAGE = "Verify your phone number to message owners. It's free.";

export function isNeedPhoneError(message: string): boolean {
  return message.includes("Verify your phone number to message owners");
}

/**
 * Server rule for sendMessage: a seeker's FIRST message on a listing thread needs the contact
 * check (verified phone + free contact / pass). Owners, squad threads, and people who already
 * messaged in this thread skip it.
 */
export function sendNeedsContactCheck(p: { listingOwnerId: string | null; senderId: string; squadThread: boolean; senderHasPriorMessage: boolean; unlocked: boolean }): boolean {
  if (!p.listingOwnerId || p.squadThread) return false;
  if (p.senderId === p.listingOwnerId) return false;
  if (p.senderHasPriorMessage || p.unlocked) return false;
  return true;
}

export type VerifyStep = "idle" | "phone" | "code" | "sending";

/** Composer copy per step. Gen Z casual, short. */
export function verifyStepCopy(step: VerifyStep): { title: string; hint: string; cta: string } {
  switch (step) {
    case "phone":
      return { title: "Quick phone check first 📱", hint: "One OTP keeps scammers out. Your number stays hidden from the owner.", cta: "Send code" };
    case "code":
      return { title: "Enter the 6-digit code", hint: "Your message sends right after.", cta: "Verify & send" };
    case "sending":
      return { title: "Verified ✓ sending…", hint: "", cta: "Sending…" };
    default:
      return { title: "", hint: "", cta: "Send" };
  }
}
