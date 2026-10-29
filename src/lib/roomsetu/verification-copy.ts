/** User-facing copy for /verification. Pure so it can be unit tested. */
export type VerificationCopyInput = {
  identitySource?: string | null;
  identityStatus?: string | null;
  attempts?: number;
  digilockerReady?: boolean;
};

export const VERIFICATION_INTRO =
  "Verify your phone and ID to publish a bed. Both done = Verified badge.";

/** DigiLocker status line, or null when DigiLocker isn't live and nothing happened yet. */
export function digilockerLine(d: VerificationCopyInput): string | null {
  if (d.identitySource === "DIGILOCKER") return "ID verified with DigiLocker ✓";
  if (d.identitySource === "STAFF") return null; // manual review card already says approved
  if (!d.digilockerReady) return null;
  if (d.identityStatus === "FAILED") return "DigiLocker didn't pass twice. Use team review below.";
  if ((d.attempts ?? 0) > 0) return "DigiLocker didn't pass. One retry left.";
  return "Fastest way: verify instantly with DigiLocker.";
}

/** Show the DigiLocker button only when it's configured and can actually be used. */
export function showDigilockerButton(d: VerificationCopyInput): boolean {
  if (!d.digilockerReady) return false;
  if (d.identitySource === "DIGILOCKER" || d.identityStatus === "VERIFIED") return false;
  return (d.attempts ?? 0) < 2;
}

export function idReviewHeading(digilockerReady: boolean | undefined): string {
  return digilockerReady ? "Or get approved by the roomeo team" : "Get your ID approved";
}
