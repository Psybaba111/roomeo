/**
 * Roomie-type quiz: 9 quick questions (+1 optional) → one of 6 original Roomeo roomie types.
 * Pure (no DB, no env reads beyond the flag helper) so it runs under node tests.
 *
 * Privacy contract: answers are only ever returned to their owner. Everyone else (hosts, listing
 * visitors) sees a type key, and listing pages only see counts per type with no names.
 * The type is always recomputed from the answers on the server; a client-sent type is ignored.
 */

export const ROOMIE_QUIZ_VERSION = 1;

export const ROOMIE_TYPE_KEYS = ["moonlighter", "sunrise", "tidy", "hype", "chill", "solo"] as const;
export type RoomieTypeKey = (typeof ROOMIE_TYPE_KEYS)[number];

export type RoomieType = {
  key: RoomieTypeKey;
  name: string;
  plural: string;
  emoji: string;
  tagline: string;
  blurb: string;
  /** Card colours for the share card (bg, accent, ink). */
  colors: { bg: string; accent: string; ink: string };
  bestWith: RoomieTypeKey[];
  clashesWith: RoomieTypeKey[];
  /** One-liner on why a clash happens, from this type's side. */
  clashTip: string;
};

export const ROOMIE_TYPES: Record<RoomieTypeKey, RoomieType> = {
  moonlighter: {
    key: "moonlighter",
    name: "Moonlighter",
    plural: "Moonlighters",
    emoji: "🌙",
    tagline: "Peak brain at 2 AM",
    blurb: "Your day starts when the city logs off. Late calls, later Maggi, headphones always on. You just need a roomie who won't flip the lights on at 6.",
    colors: { bg: "#1d1b3a", accent: "#ffcf5c", ink: "#f6f3ff" },
    bestWith: ["solo", "chill"],
    clashesWith: ["sunrise"],
    clashTip: "Agree on a lights-and-volume rule after 11 and it's smooth sailing.",
  },
  sunrise: {
    key: "sunrise",
    name: "Sunrise Sipper",
    plural: "Sunrise Sippers",
    emoji: "☀️",
    tagline: "Chai, gym, inbox zero by 9",
    blurb: "Early alarm, early dinner, early lights-out. You run on routine and you've probably made your bed already. Quiet nights = happy you.",
    colors: { bg: "#fff1d6", accent: "#ff7a2f", ink: "#2b1a0a" },
    bestWith: ["tidy", "solo"],
    clashesWith: ["moonlighter", "hype"],
    clashTip: "Sort out quiet hours on day one, not at 1 AM.",
  },
  tidy: {
    key: "tidy",
    name: "Tidy Titan",
    plural: "Tidy Titans",
    emoji: "🧽",
    tagline: "Dishes done before they hit the sink",
    blurb: "A clean room is a calm mind. You notice the hair in the drain so no one else has to. Chore charts? You'd make one for fun.",
    colors: { bg: "#e3f6ef", accent: "#13a37f", ink: "#0b2b22" },
    bestWith: ["sunrise", "solo"],
    clashesWith: ["hype"],
    clashTip: "A simple weekly chore split saves a lot of silent sighing.",
  },
  hype: {
    key: "hype",
    name: "Hype Host",
    plural: "Hype Hosts",
    emoji: "🎉",
    tagline: "The room is the group chat",
    blurb: "Friends over, playlist on, food for everyone. You turn a PG into a home and a roomie into a best friend. Main-character energy only.",
    colors: { bg: "#ffe0ec", accent: "#e8336d", ink: "#3a0a1c" },
    bestWith: ["chill", "hype"],
    clashesWith: ["tidy", "sunrise"],
    clashTip: "Give a heads-up before guests and keep weeknights low-key.",
  },
  chill: {
    key: "chill",
    name: "Chill Pill",
    plural: "Chill Pills",
    emoji: "🌿",
    tagline: "Whatever works, works",
    blurb: "Not fussy about food, noise or who's over. You go with the flow and calm down a tense room. Everyone's easiest roomie.",
    colors: { bg: "#eef3dc", accent: "#6a8f1f", ink: "#1f2a08" },
    bestWith: ["hype", "moonlighter", "chill"],
    clashesWith: [],
    clashTip: "Easygoing is great, but still say it out loud when something bugs you.",
  },
  solo: {
    key: "solo",
    name: "Solo Mode",
    plural: "Solo Modes",
    emoji: "🎧",
    tagline: "Friendly, but door-closed friendly",
    blurb: "Deep work, your own shelf, your own snacks. You're a great roomie as long as personal space is respected. Small talk: optional.",
    colors: { bg: "#e4ecff", accent: "#3459d6", ink: "#0d1838" },
    bestWith: ["tidy", "moonlighter", "sunrise"],
    clashesWith: ["hype"],
    clashTip: "Say early that quiet time isn't you being rude.",
  },
};

export type RoomieOption = {
  id: string;
  label: string;
  /** Type points (which roomie type this answer leans to). */
  points: Partial<Record<RoomieTypeKey, number>>;
  /** Position on the question's 0..3 scale, used by the compatibility score. */
  value: number;
  /** "Don't mind": matches anyone on this question. */
  any?: boolean;
};
export type RoomieQuestion = {
  id: string;
  topic: string;
  prompt: string;
  /** Optional questions (low weight) can be skipped. */
  optional?: boolean;
  /** scale: similarity from distance on 0..3; category: same answer = 1, different = config.categoryMiss. */
  kind: "scale" | "category";
  options: RoomieOption[];
};

/**
 * 9 core questions (+1 optional) ≈ 2 minutes. Heavy: sleep, cleanliness, smoking/drinking, veg/non-veg, guests.
 * Medium: noise, AC temperature, how social, work/study hours. Low + optional: hobbies & music.
 * Weights and hard rule-outs live in roomie-match-config.ts, not here.
 */
export const ROOMIE_QUESTIONS: RoomieQuestion[] = [
  {
    id: "sleep",
    topic: "Sleep",
    prompt: "It's a weeknight. When do you actually crash? 😴",
    kind: "scale",
    options: [
      { id: "early", label: "Before 11. Sleep is self-care", value: 0, points: { sunrise: 3, tidy: 1 } },
      { id: "mid", label: "Around midnight-ish", value: 1, points: { chill: 2, solo: 1 } },
      { id: "late", label: "1–2 AM, the night is young", value: 2, points: { moonlighter: 2, hype: 1 } },
      { id: "vlate", label: "3 AM+ (or after my shift)", value: 3, points: { moonlighter: 3 } },
    ],
  },
  {
    id: "clean",
    topic: "Cleanliness",
    prompt: "Your side of the room on a random Wednesday:",
    kind: "scale",
    options: [
      { id: "spotless", label: "Spotless. Dishes done, bed made ✨", value: 0, points: { tidy: 4 } },
      { id: "tidy", label: "Tidy enough, clean every couple of days", value: 1, points: { sunrise: 2, solo: 1 } },
      { id: "chaos", label: "Organised chaos, the chair is a wardrobe", value: 2, points: { chill: 2, moonlighter: 1 } },
      { id: "mess", label: "Looks like last night's hangout", value: 3, points: { hype: 2, chill: 1 } },
    ],
  },
  {
    id: "smoke",
    topic: "Smoking / drinking",
    prompt: "Smoking and drinking, where are you at?",
    kind: "scale",
    options: [
      { id: "strict", label: "Neither, and I need a smoke-free room", value: 0, points: { tidy: 2, sunrise: 1 } },
      { id: "nojudge", label: "Neither, but zero judgement", value: 1, points: { chill: 2, solo: 1 } },
      { id: "drinks", label: "Weekend drinks 🍻, never smoke", value: 2, points: { hype: 3 } },
      { id: "smokes", label: "I smoke (outside) and drink sometimes", value: 3, points: { moonlighter: 2, chill: 1 } },
    ],
  },
  {
    id: "food",
    topic: "Food",
    prompt: "Veg or non-veg?",
    kind: "scale",
    options: [
      { id: "vegStrict", label: "Pure veg, I'd like a veg-only kitchen", value: 0, points: { tidy: 2, sunrise: 1 } },
      { id: "vegFlex", label: "Veg, but non-veg around me is fine", value: 1, points: { chill: 2, solo: 1 } },
      { id: "nonveg", label: "Non-veg, mostly eat out / order in", value: 2, points: { moonlighter: 2, solo: 1 } },
      { id: "nonvegCook", label: "Non-veg and I cook it, feed the floor", value: 3, points: { hype: 1, tidy: 1, chill: 1 } },
    ],
  },
  {
    id: "guests",
    topic: "Guests",
    prompt: "Friends dropping by your room…",
    kind: "scale",
    options: [
      { id: "never", label: "Never at night, please", value: 0, points: { tidy: 2, sunrise: 1 } },
      { id: "rare", label: "Rarely, I meet people outside", value: 1, points: { solo: 2, tidy: 1 } },
      { id: "sometimes", label: "Sometimes, with a heads-up", value: 2, points: { chill: 2, hype: 1 } },
      { id: "often", label: "Every weekend, the more the merrier", value: 3, points: { hype: 3 } },
    ],
  },
  {
    id: "noise",
    topic: "Noise",
    prompt: "Music, calls and gaming in the room?",
    kind: "scale",
    options: [
      { id: "silent", label: "Silent. Headphones always", value: 0, points: { solo: 2, sunrise: 1 } },
      { id: "low", label: "Low volume, before 10", value: 1, points: { tidy: 2, sunrise: 1 } },
      { id: "some", label: "Calls and music, normal volume", value: 2, points: { chill: 2, moonlighter: 1 } },
      { id: "loud", label: "Speaker on. Let's vibe 🔊", value: 3, points: { hype: 3 } },
    ],
  },
  {
    id: "ac",
    topic: "AC",
    prompt: "AC temperature at night?",
    kind: "scale",
    options: [
      { id: "cold", label: "18–20°, freeze me 🥶", value: 0, points: { moonlighter: 1, hype: 1 } },
      { id: "mid", label: "22–24°, the sweet spot", value: 1, points: { tidy: 2, solo: 1 } },
      { id: "warm", label: "26°+ or just the fan", value: 2, points: { sunrise: 2 } },
      { id: "any", label: "Don't mind at all", value: 1, any: true, points: { chill: 2 } },
    ],
  },
  {
    id: "social",
    topic: "Social",
    prompt: "With your roomie, you're…",
    kind: "scale",
    options: [
      { id: "private", label: "Hi-bye. I keep to myself", value: 0, points: { solo: 3 } },
      { id: "friendly", label: "Friendly, chai chats sometimes", value: 1, points: { sunrise: 1, tidy: 1 } },
      { id: "hang", label: "Down to hang most evenings", value: 2, points: { chill: 2 } },
      { id: "bff", label: "Roomie = new best friend", value: 3, points: { hype: 3 } },
    ],
  },
  {
    id: "hours",
    topic: "Work / study",
    prompt: "Your work or study hours look like…",
    kind: "scale",
    options: [
      { id: "day", label: "Classic 9 to 6, office or college", value: 0, points: { sunrise: 3 } },
      { id: "flex", label: "Flexible, all over the place", value: 1, points: { chill: 2, hype: 1 } },
      { id: "wfh", label: "WFH, mostly in my room", value: 1, points: { solo: 3 } },
      { id: "night", label: "Night shift / US-client hours", value: 3, points: { moonlighter: 3 } },
    ],
  },
  {
    id: "vibe",
    topic: "Hobbies & music",
    prompt: "Off-duty, you're mostly into… (optional)",
    optional: true,
    kind: "category",
    options: [
      { id: "gaming", label: "Gaming 🎮", value: 0, points: { moonlighter: 1 } },
      { id: "fitness", label: "Gym, cricket, running", value: 1, points: { sunrise: 1 } },
      { id: "music", label: "Music, jamming, going out", value: 2, points: { hype: 1 } },
      { id: "series", label: "Series, books, chill", value: 3, points: { solo: 1 } },
    ],
  },
];

export type RoomieAnswers = Record<string, string>;

/** Tie order: the more "specific" types win ties so a flat score set doesn't always land on Chill Pill. */
const TIE_ORDER: RoomieTypeKey[] = ["moonlighter", "sunrise", "tidy", "hype", "solo", "chill"];

export function isRoomieType(v: unknown): v is RoomieTypeKey {
  return typeof v === "string" && (ROOMIE_TYPE_KEYS as readonly string[]).includes(v);
}

/** Keep only known question ids with a known option id. Anything else is dropped. */
export function cleanAnswers(input: unknown): RoomieAnswers {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const out: RoomieAnswers = {};
  for (const q of ROOMIE_QUESTIONS) {
    const v = src[q.id];
    if (typeof v === "string" && q.options.some((o) => o.id === v)) out[q.id] = v;
  }
  return out;
}

/** All required (non-optional) questions answered. */
export function isComplete(answers: RoomieAnswers): boolean {
  return ROOMIE_QUESTIONS.every((q) => q.optional || typeof answers[q.id] === "string");
}

export function roomieScores(answers: RoomieAnswers): Record<RoomieTypeKey, number> {
  const scores = Object.fromEntries(ROOMIE_TYPE_KEYS.map((k) => [k, 0])) as Record<RoomieTypeKey, number>;
  for (const q of ROOMIE_QUESTIONS) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (!opt) continue;
    for (const [k, p] of Object.entries(opt.points)) scores[k as RoomieTypeKey] += p ?? 0;
  }
  return scores;
}

/** The type for a full answer set. Throws when answers are missing so a half quiz is never saved. */
export function roomieTypeFor(input: unknown): RoomieTypeKey {
  const answers = cleanAnswers(input);
  if (!isComplete(answers)) throw new Error("Answer all the questions first.");
  const scores = roomieScores(answers);
  let best: RoomieTypeKey = TIE_ORDER[0];
  for (const k of TIE_ORDER) if (scores[k] > scores[best]) best = k;
  return best;
}

/** "2 Moonlighters, 1 Sunrise Sipper" — counts only, no names; biggest group first, then type order. */
export function occupantSummary(counts: Partial<Record<string, number>>): string {
  const parts = ROOMIE_TYPE_KEYS.map((k) => [k, Math.max(0, Math.floor(Number(counts[k]) || 0))] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || ROOMIE_TYPE_KEYS.indexOf(a[0]) - ROOMIE_TYPE_KEYS.indexOf(b[0]))
    .map(([k, n]) => `${n} ${n === 1 ? ROOMIE_TYPES[k].name : ROOMIE_TYPES[k].plural}`);
  return parts.join(", ");
}

/** Count type keys (unknown keys are ignored). */
export function countTypes(keys: unknown[]): Partial<Record<RoomieTypeKey, number>> {
  const out: Partial<Record<RoomieTypeKey, number>> = {};
  for (const k of keys) if (isRoomieType(k)) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export const ROOMIE_SHARE_UTM = { utm_source: "instagram", utm_medium: "story", utm_campaign: "roomie_quiz" } as const;

/** Link printed on the share card. utm_content carries the type so we can see which card travels. */
export function roomieShareUrl(origin: string, type: RoomieTypeKey): string {
  const q = new URLSearchParams({ ...ROOMIE_SHARE_UTM, utm_content: type }).toString();
  if (!/^https?:\/\/[^/]/.test(origin)) return `/roomie-quiz?${q}`;
  return `${origin.replace(/\/+$/, "")}/roomie-quiz?${q}`;
}

/** Short, human-readable version for the card itself (no protocol, no query). */
export function roomieShareLabel(origin: string): string {
  try {
    return `${new URL(origin).host.replace(/^www\./, "")}/roomie-quiz`;
  } catch {
    return "Roomeo · roomie quiz";
  }
}

type Env = Record<string, string | undefined>;

/**
 * ROOMIE_QUIZ_ENABLED: "true"/"false" wins when set. Unset → ON for Vercel preview and local dev,
 * OFF in production, so merging changes nothing live until the flag is set to true in Production.
 */
export function roomieQuizEnabled(env: Env): boolean {
  const v = env.ROOMIE_QUIZ_ENABLED?.trim().toLowerCase();
  if (v) return v === "true" || v === "1" || v === "on" || v === "yes";
  const vercel = env.VERCEL_ENV?.trim();
  if (vercel) return vercel !== "production";
  return env.NODE_ENV !== "production";
}
