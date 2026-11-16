/**
 * "Vibe match": 0–100% between a seeker and a room's current occupants. Pure, config-driven, no ML.
 *
 * Pair score (seeker vs one occupant):
 *   - For each question both answered with weight w > 0: similarity s in [0,1].
 *       scale questions:    s = 1 − |a − b| / 3   ("Don't mind" answers give s = 1)
 *       category questions: s = 1 if same, else config.categoryMiss
 *   - pair = 100 × Σ(w·s) / Σ(w), over questions both answered.
 *   - If the questions both answered carry less than config.minCoverage of the total weight → no score (null).
 *   - Hard rule-out (config.hardClashes, e.g. smoker vs smoke-free, strict veg vs non-veg):
 *       pair = min(pair, config.pairHardClashCap) and the pair is flagged.
 *
 * Room score (exact cap rule):
 *   avg   = mean of the scorable pair scores
 *   worst = min of the scorable pair scores
 *   room  = round( clamp( min(avg, worst + config.worstPairMargin), 0, 100 ) )
 *   So one bad pair drags the room down: with the defaults the room is never more than 25 points above
 *   its worst pair, and any hard clash (worst ≤ 15) keeps the room at 40% or less and sets ruleOut.
 *   One occupant: avg = worst, so room = that pair. No scorable pairs (no quiz, empty room) → null (badge hidden).
 *
 * Output never contains names, ids or raw answers: only the score, flags and generic lines per question.
 */
import { ROOMIE_QUESTIONS, cleanAnswers, type RoomieAnswers, type RoomieQuestion } from "./roomie-quiz.ts";
import { DEFAULT_MATCH_CONFIG, type RoomieMatchConfig } from "./roomie-match-config.ts";

const SCALE_SPAN = 3;

export type PairScore = { score: number; hardClash: string[]; sims: Record<string, number> } | null;

export type RoomMatch = {
  score: number;
  ruleOut: boolean;
  pairs: number;
  why: string[];
  headsUp: string[];
} | null;

/** Generic copy per question. Never mentions who, never quotes an answer. */
export const MATCH_LINES: Record<string, { click: string; heads: string; clash?: string }> = {
  sleep: { click: "Sleep times line up, so no 2 AM light wars 🌙", heads: "Sleep times differ here. Agree on lights-out early." },
  clean: { click: "Same cleanliness standards, the sink stays peaceful 🧽", heads: "Different cleanliness levels. A chore split will help." },
  smoke: { click: "On the same page about smoking and drinking", heads: "Smoking and drinking habits differ a bit", clash: "Smoking doesn't work for someone here 🚭" },
  food: { click: "Food habits match, the kitchen is chill 🍛", heads: "Food habits differ. Talk shelves and utensils.", clash: "Veg / non-veg doesn't line up with someone here 🥗" },
  guests: { click: "Similar take on guests 🚪", heads: "Guest expectations differ. Set a heads-up rule." },
  noise: { click: "Noise levels match, headphones optional 🎧", heads: "Noise levels differ. Headphones will be your friend." },
  ac: { click: "No AC remote fights ❄️", heads: "AC temperature preferences differ." },
  social: { click: "Same social energy at home", heads: "Different social energy. Some want company, some want space." },
  hours: { click: "Similar work/study hours ⏰", heads: "Work/study hours differ, so mornings and nights may overlap." },
  vibe: { click: "Overlapping hobbies, instant small talk 🎮", heads: "Different hobbies (that's fine!)" },
};

function option(q: RoomieQuestion, id: string | undefined) {
  return id ? q.options.find((o) => o.id === id) : undefined;
}

function similarity(q: RoomieQuestion, a: string, b: string, cfg: RoomieMatchConfig): number {
  const oa = option(q, a);
  const ob = option(q, b);
  if (!oa || !ob) return 0;
  if (oa.any || ob.any) return 1;
  if (q.kind === "category") return oa.id === ob.id ? 1 : cfg.categoryMiss;
  return Math.max(0, 1 - Math.abs(oa.value - ob.value) / SCALE_SPAN);
}

function isHardClash(qid: string, a: string, b: string, cfg: RoomieMatchConfig): boolean {
  return cfg.hardClashes.some(([q, x, y]) => q === qid && ((a === x && b === y) || (a === y && b === x)));
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function pairScore(seekerIn: RoomieAnswers, otherIn: RoomieAnswers, cfg: RoomieMatchConfig = DEFAULT_MATCH_CONFIG): PairScore {
  const seeker = cleanAnswers(seekerIn);
  const other = cleanAnswers(otherIn);
  let total = 0;
  let covered = 0;
  let sum = 0;
  const sims: Record<string, number> = {};
  const hardClash: string[] = [];
  for (const q of ROOMIE_QUESTIONS) {
    const w = Math.max(0, Number(cfg.weights[q.id]) || 0);
    if (!w) continue;
    total += w;
    const a = seeker[q.id];
    const b = other[q.id];
    if (!a || !b) continue;
    covered += w;
    const s = similarity(q, a, b, cfg);
    sims[q.id] = s;
    sum += w * s;
    if (isHardClash(q.id, a, b, cfg)) hardClash.push(q.id);
  }
  if (!total || !covered || covered / total < cfg.minCoverage) return null;
  let score = clamp((100 * sum) / covered);
  if (hardClash.length) score = Math.min(score, clamp(cfg.pairHardClashCap));
  return { score, hardClash, sims };
}

/** Seeker vs every occupant (answers only reach this function on the server). */
export function roomMatch(seeker: RoomieAnswers | null | undefined, occupants: RoomieAnswers[], cfg: RoomieMatchConfig = DEFAULT_MATCH_CONFIG): RoomMatch {
  if (!seeker) return null;
  const pairs = occupants.map((o) => pairScore(seeker, o, cfg)).filter((p): p is NonNullable<PairScore> => p !== null);
  if (!pairs.length) return null;
  const avg = pairs.reduce((a, p) => a + p.score, 0) / pairs.length;
  const worst = Math.min(...pairs.map((p) => p.score));
  const score = Math.round(clamp(Math.min(avg, worst + cfg.worstPairMargin)));
  const clashQs = [...new Set(pairs.flatMap((p) => p.hardClash))];

  // Lines per question: heads-up when ANY occupant is far apart (min ≤ headsUpAt) or on a hard clash;
  // "why you'll click" when the room is close on average (avg ≥ clickAt) with no heads-up. If that gives fewer
  // than 2 lines, the next-closest questions (avg ≥ 0.6) fill up to 2. Highest weight first.
  const byWeight = ROOMIE_QUESTIONS.map((q) => q.id)
    .filter((id) => (Number(cfg.weights[id]) || 0) > 0 && MATCH_LINES[id])
    .sort((a, b) => (Number(cfg.weights[b]) || 0) - (Number(cfg.weights[a]) || 0));
  const stats = (id: string) => {
    const v = pairs.map((p) => p.sims[id]).filter((x): x is number => typeof x === "number");
    return v.length === pairs.length ? { min: Math.min(...v), avg: v.reduce((x, y) => x + y, 0) / v.length } : null;
  };
  const why: string[] = [];
  const headsUp: string[] = clashQs.map((id) => MATCH_LINES[id]?.clash ?? MATCH_LINES[id]?.heads).filter((x): x is string => Boolean(x));
  const spare: Array<{ id: string; avg: number }> = [];
  for (const id of byWeight) {
    const st = stats(id);
    if (!st || clashQs.includes(id)) continue;
    if (st.min <= cfg.headsUpAt) headsUp.push(MATCH_LINES[id].heads);
    else if (st.avg >= cfg.clickAt) why.push(MATCH_LINES[id].click);
    else if (st.avg >= 0.6) spare.push({ id, avg: st.avg });
  }
  for (const { id } of spare.sort((x, y) => y.avg - x.avg)) {
    if (why.length >= 2) break;
    why.push(MATCH_LINES[id].click);
  }
  return { score, ruleOut: clashQs.length > 0, pairs: pairs.length, why: why.slice(0, 3), headsUp: headsUp.slice(0, 3) };
}
