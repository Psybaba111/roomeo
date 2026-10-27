import { z } from "zod";

/** UPI payee details from env. Both must be set or checkout stays off. */
export function upiPayee(env: Record<string, string | undefined> = process.env) {
  const vpa = env.ROOMEO_UPI_VPA?.trim() ?? "";
  const name = env.ROOMEO_UPI_NAME?.trim() || "Roomeo";
  return { ready: vpaSchema.safeParse(vpa).success, vpa, name };
}

export const vpaSchema = z.string().regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/);

/** 12-digit UPI transaction reference (UTR / RRN). */
export const utrSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{12}$/, "Enter the 12-digit UTR from your UPI app."));

export const submitUtrInput = z.object({
  ref: z.string().regex(/^RM[A-Z0-9]{8}$/, "Unknown payment."),
  utr: utrSchema,
});

export const planCodeSchema = z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/);

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short, unambiguous reference shown in the UPI note (e.g. RM7K2QX9AB). */
export function makeRef(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(8);
  let out = "RM";
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return out;
}

/** upi://pay deep link per the NPCI UPI linking spec. */
export function buildUpiLink(p: { vpa: string; name: string; amountInr: number; ref: string }): string {
  if (!vpaSchema.safeParse(p.vpa).success) throw new Error("Invalid UPI ID.");
  if (!Number.isInteger(p.amountInr) || p.amountInr <= 0) throw new Error("Invalid amount.");
  const q = new URLSearchParams({
    pa: p.vpa,
    pn: p.name,
    am: p.amountInr.toFixed(2),
    cu: "INR",
    tn: `Roomeo ${p.ref}`,
    tr: p.ref,
  });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

export const UTR_LIMIT = { max: 5, windowMinutes: 60 };

export function rateLimited(recentAttempts: number, limit = UTR_LIMIT.max): boolean {
  return recentAttempts >= limit;
}
