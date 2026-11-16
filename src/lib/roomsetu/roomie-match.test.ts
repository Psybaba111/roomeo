import test from "node:test";
import assert from "node:assert/strict";
import { ROOMIE_QUESTIONS, type RoomieAnswers } from "./roomie-quiz.ts";
import { pairScore, roomMatch } from "./roomie-match.ts";
import { DEFAULT_MATCH_CONFIG, type RoomieMatchConfig } from "./roomie-match-config.ts";

/** Everyone answers option index `i` unless overridden. */
function all(i: number, over: RoomieAnswers = {}): RoomieAnswers {
  const out: RoomieAnswers = {};
  for (const q of ROOMIE_QUESTIONS) out[q.id] = q.options[i].id;
  return { ...out, ...over };
}
// Option 0 of "ac" is "cold"; option 3 is "any" (a wildcard), so pin AC for the distance tests.
const base = all(1, { ac: "mid", smoke: "nojudge", food: "vegFlex" });
const cfg = (over: Partial<RoomieMatchConfig>): RoomieMatchConfig => ({ ...DEFAULT_MATCH_CONFIG, ...over, weights: { ...DEFAULT_MATCH_CONFIG.weights, ...(over.weights ?? {}) } });

test("identical answers → 100%, with click lines and no heads-up", () => {
  assert.equal(pairScore(base, base)?.score, 100);
  const m = roomMatch(base, [base, base]);
  assert.equal(m?.score, 100);
  assert.equal(m?.ruleOut, false);
  assert.ok((m?.why.length ?? 0) >= 2 && (m?.why.length ?? 0) <= 3);
  assert.deepEqual(m?.headsUp, []);
});

test("hard clash on smoking: pair capped at 15, room flagged with a deal-breaker line", () => {
  const smoker = { ...base, smoke: "smokes" };
  const strict = { ...base, smoke: "strict" };
  const p = pairScore(smoker, strict);
  assert.ok(p && p.score <= DEFAULT_MATCH_CONFIG.pairHardClashCap);
  assert.deepEqual(p?.hardClash, ["smoke"]);
  const m = roomMatch(strict, [smoker]);
  assert.equal(m?.ruleOut, true);
  assert.match(m?.headsUp[0] ?? "", /Smoking/);
  assert.ok(!(m?.why ?? []).some((l) => /smoking/i.test(l)));
  // Not a clash: a non-smoker who doesn't mind.
  assert.equal(pairScore(smoker, { ...base, smoke: "nojudge" })?.hardClash.length, 0);
});

test("hard clash on food: strict veg vs non-veg", () => {
  const p = pairScore({ ...base, food: "vegStrict" }, { ...base, food: "nonvegCook" });
  assert.deepEqual(p?.hardClash, ["food"]);
  assert.ok((p?.score ?? 100) <= 15);
  assert.equal(pairScore({ ...base, food: "vegFlex" }, { ...base, food: "nonvegCook" })?.hardClash.length, 0);
});

test("empty room or no seeker quiz → null (badge hidden)", () => {
  assert.equal(roomMatch(base, []), null);
  assert.equal(roomMatch(null, [base]), null);
  assert.equal(roomMatch(undefined, [base]), null);
});

test("missing answers: skipped questions drop out; too little overlap → no score", () => {
  const partial = { ...base };
  delete partial.vibe;
  delete partial.ac;
  assert.equal(pairScore(partial, base)?.score, 100);
  const tiny: RoomieAnswers = { sleep: "early", clean: "spotless" };
  assert.equal(pairScore(tiny, base), null);
  assert.equal(roomMatch(base, [tiny]), null);
  // Unscorable occupants are ignored, scorable ones still count.
  assert.equal(roomMatch(base, [tiny, base])?.pairs, 1);
  // Junk answers are ignored, not trusted.
  assert.equal(pairScore({ ...base, sleep: "noon" } as RoomieAnswers, base)?.sims.sleep, undefined);
});

test("single occupant: room = that pair; many: average", () => {
  const far = { ...base, sleep: "vlate", noise: "loud" };
  const one = pairScore(base, far)!.score;
  assert.equal(roomMatch(base, [far])?.score, Math.round(one));
  const many = roomMatch(base, [base, base, far]);
  const avg = (100 + 100 + one) / 3;
  assert.equal(many?.score, Math.round(Math.min(avg, one + DEFAULT_MATCH_CONFIG.worstPairMargin)));
  assert.equal(many?.pairs, 3);
});

test("worst-pair cap: room ≤ worst pair + margin, even with many perfect matches", () => {
  const opposite = all(3, { ac: "cold", smoke: "smokes", food: "nonvegCook" });
  const awful = pairScore(base, opposite)!.score;
  const m = roomMatch(base, [base, base, base, base, base, base, base, base, opposite]);
  assert.ok(m!.score <= Math.round(awful + DEFAULT_MATCH_CONFIG.worstPairMargin));
  // A wider margin lets the average through.
  const loose = roomMatch(base, [base, base, base, opposite], cfg({ worstPairMargin: 100 }));
  assert.equal(loose?.score, Math.round((300 + awful) / 4));
});

test("bounds: always an integer in 0–100", () => {
  const a = all(0, { ac: "cold", food: "vegStrict", smoke: "strict" });
  const b = all(3, { ac: "warm", food: "nonvegCook", smoke: "smokes", vibe: "series" });
  const m = roomMatch(a, [b]);
  assert.ok(m!.score <= 5, String(m?.score)); // AC only spans 0..2 and hobbies give partial credit
  assert.equal(m?.ruleOut, true);
  assert.equal(roomMatch(a, [b], cfg({ weights: { ac: 0 }, categoryMiss: 0 }))?.score, 0);
  assert.equal(roomMatch(base, [base], cfg({ pairHardClashCap: 500 }))?.score, 100);
  const weird = roomMatch(a, [b], cfg({ weights: { sleep: -5 }, worstPairMargin: -50 }));
  assert.ok(Number.isInteger(weird?.score) && weird!.score >= 0 && weird!.score <= 100);
  for (let i = 0; i < 200; i++) {
    const r = (): RoomieAnswers => Object.fromEntries(ROOMIE_QUESTIONS.map((q) => [q.id, q.options[Math.floor(Math.random() * 4)].id]));
    const s = roomMatch(r(), [r(), r(), r()])?.score;
    assert.ok(s !== undefined && Number.isInteger(s) && s >= 0 && s <= 100);
  }
});

test("weights come from config: changing them changes the score", () => {
  const nightOwl = { ...base, sleep: "vlate" };
  const dflt = pairScore(base, nightOwl)!.score;
  assert.ok(dflt < 100);
  assert.equal(pairScore(base, nightOwl, cfg({ weights: { sleep: 0 } }))?.score, 100);
  assert.ok(pairScore(base, nightOwl, cfg({ weights: { sleep: 50 } }))!.score < dflt);
  // Low-weight "vibe" barely moves things; zero weight ignores it entirely.
  const otherHobby = { ...base, vibe: "gaming" };
  assert.ok(pairScore(base, otherHobby)!.score > 95);
  assert.equal(pairScore(base, otherHobby, cfg({ weights: { vibe: 0 } }))?.score, 100);
  // Hard rules are config too.
  assert.equal(pairScore({ ...base, smoke: "smokes" }, { ...base, smoke: "strict" }, cfg({ hardClashes: [] }))?.hardClash.length, 0);
});

test("lines never contain answers or option labels", () => {
  const labels = ROOMIE_QUESTIONS.flatMap((q) => q.options.map((o) => o.label));
  const m = roomMatch(all(0, { ac: "cold" }), [all(3, { ac: "warm" }), all(0, { ac: "cold" })]);
  for (const line of [...(m?.why ?? []), ...(m?.headsUp ?? [])]) for (const l of labels) assert.ok(!line.includes(l), line);
});
