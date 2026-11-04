import { ensureProfile, updateProfile } from "@/lib/roomsetu/account-api";

type Extra = { mobile?: string; city?: string; intent?: string };

/**
 * Apply the mobile/city/intent a person typed on the sign-up screen
 * (sessionStorage "roomsetu-extra"), then make sure a profile exists.
 *
 * This used to live inside /dashboard, which was the single post-sign-in
 * landing page. /activity is that landing page for renters now, so both call
 * here instead of duplicating the mapping.
 */
export async function applySignupExtras() {
  const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("roomsetu-extra");
  sessionStorage.removeItem("roomsetu-extra");
  let extra: Extra | null = null;
  try {
    extra = raw ? (JSON.parse(raw) as Extra) : null;
  } catch {
    extra = null;
  }
  const intent =
    extra?.intent === "LOOKING" || extra?.intent === "OFFERING" || extra?.intent === "BOTH"
      ? extra.intent
      : "BOTH";
  const profile = await ensureProfile({ data: { intent } });
  if (!extra || (!extra.mobile && !extra.city)) return profile;
  return updateProfile({
    data: {
      name: profile.name,
      mobile: extra.mobile || profile.mobile,
      age: profile.age,
      gender: profile.gender,
      city: extra.city || profile.city,
      occupation: profile.occupation,
      intent: extra.intent || profile.intent,
      preferredCities: profile.preferredCities,
      about: profile.about,
      lifestyle: profile.lifestyle,
      smoking: profile.smoking,
      pets: profile.pets,
      food: profile.food,
      budget: profile.budget,
      moveIn: profile.moveIn,
      roomPref: profile.roomPref,
      furnishedPref: profile.furnishedPref,
      showAge: profile.showAge,
      showOccupation: profile.showOccupation,
      showCity: profile.showCity,
      allowMessages: profile.allowMessages,
    },
  });
}
