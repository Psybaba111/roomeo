/** Vibe tags shown on cards. Derived only from facts the host entered, so they never overpromise. */
export type VibeSource = {
  wifi?: unknown;
  ac?: unknown;
  pets_allowed?: unknown;
  smoking_allowed?: unknown;
  food_available?: unknown;
  kitchen?: unknown;
  guest_policy?: unknown;
  description?: unknown;
  occupation_pref?: unknown;
};

const yes = (v: unknown) => v === true || v === "t" || v === "true" || v === 1;
const text = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

export const VIBES = ["WFH-friendly", "Pet ok", "Night owl", "Ghar ka khana", "Cook your own", "AC", "Smoke-free", "Student-friendly"] as const;
export type Vibe = (typeof VIBES)[number];

export function vibeTags(row: VibeSource, max = 3): Vibe[] {
  const words = `${text(row.description)} ${text(row.guest_policy)}`;
  const out: Vibe[] = [];
  if (yes(row.wifi)) out.push("WFH-friendly");
  if (yes(row.pets_allowed)) out.push("Pet ok");
  if (/\b(late|night|24x7|24\/7|no curfew|flexible hours)\b/.test(words)) out.push("Night owl");
  if (yes(row.food_available)) out.push("Ghar ka khana");
  else if (yes(row.kitchen)) out.push("Cook your own");
  if (yes(row.ac)) out.push("AC");
  if (row.smoking_allowed !== undefined && !yes(row.smoking_allowed)) out.push("Smoke-free");
  if (/student/.test(text(row.occupation_pref)) || /\bstudents?\b|college/.test(words)) out.push("Student-friendly");
  return out.slice(0, max);
}
