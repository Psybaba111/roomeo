import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanAnswers,
  countTypes,
  isComplete,
  occupantSummary,
  ROOMIE_QUESTIONS,
  ROOMIE_TYPE_KEYS,
  ROOMIE_TYPES,
  roomieQuizEnabled,
  roomieShareLabel,
  roomieShareUrl,
  roomieTypeFor,
  type RoomieAnswers,
  type RoomieTypeKey,
} from "./roomie-quiz.ts";

/** Answer every question with the option that gives `type` the most points. */
function leanTo(type: RoomieTypeKey): RoomieAnswers {
  const out: RoomieAnswers = {};
  for (const q of ROOMIE_QUESTIONS) {
    const best = [...q.options].sort((a, b) => (b.points[type] ?? 0) - (a.points[type] ?? 0))[0];
    out[q.id] = best.id;
  }
  return out;
}

test("8–12 questions, each with 4 unique options, covering every required topic", () => {
  assert.ok(ROOMIE_QUESTIONS.length >= 8 && ROOMIE_QUESTIONS.length <= 12);
  const topics = new Set(ROOMIE_QUESTIONS.map((q) => q.topic));
  for (const t of ["Sleep", "Cleanliness", "Noise", "Guests", "Food", "Smoking / drinking", "Work / study", "AC", "Social", "Hobbies & music"]) assert.ok(topics.has(t), t);
  assert.equal(new Set(ROOMIE_QUESTIONS.map((q) => q.id)).size, ROOMIE_QUESTIONS.length);
  for (const q of ROOMIE_QUESTIONS) {
    assert.equal(q.options.length, 4, q.id);
    assert.equal(new Set(q.options.map((o) => o.id)).size, 4, q.id);
    for (const o of q.options) for (const k of Object.keys(o.points)) assert.ok((ROOMIE_TYPE_KEYS as readonly string[]).includes(k), `${q.id}.${o.id}:${k}`);
  }
});

test("six original types, each with best matches and copy; no MyRoomeo animal names", () => {
  assert.equal(ROOMIE_TYPE_KEYS.length, 6);
  const banned = /beaver|cat\b|owl|fox|bunny|turtle|organizer|social butterfly|free spirit|quiet thinker/i;
  for (const k of ROOMIE_TYPE_KEYS) {
    const t = ROOMIE_TYPES[k];
    assert.equal(t.key, k);
    assert.ok(t.bestWith.length >= 1, k);
    for (const m of [...t.bestWith, ...t.clashesWith]) assert.ok(ROOMIE_TYPES[m], `${k} → ${m}`);
    assert.ok(!t.clashesWith.some((c) => t.bestWith.includes(c)), `${k} best and clash overlap`);
    assert.doesNotMatch(`${t.name} ${t.plural} ${t.tagline} ${t.blurb}`, banned, k);
  }
});

test("every type is reachable", () => {
  for (const k of ROOMIE_TYPE_KEYS) assert.equal(roomieTypeFor(leanTo(k)), k);
});

test("about 8 required questions (2 min); only the low-weight one is optional", () => {
  const required = ROOMIE_QUESTIONS.filter((q) => !q.optional);
  assert.ok(required.length >= 8 && required.length <= 9, String(required.length));
  assert.deepEqual(ROOMIE_QUESTIONS.filter((q) => q.optional).map((q) => q.id), ["vibe"]);
  const a = leanTo("solo");
  delete a.vibe;
  assert.equal(isComplete(a), true);
  assert.equal(roomieTypeFor(a), "solo");
});

test("incomplete or junk answers are never typed", () => {
  const a = leanTo("tidy");
  delete a.sleep;
  assert.equal(isComplete(a), false);
  assert.throws(() => roomieTypeFor(a), /Answer all/);
  assert.throws(() => roomieTypeFor({ ...leanTo("tidy"), sleep: "nope" }), /Answer all/);
  assert.deepEqual(cleanAnswers({ sleep: "early", bogus: "x", noise: 5 }), { sleep: "early" });
  assert.deepEqual(cleanAnswers(null), {});
  assert.deepEqual(cleanAnswers(["early"]), {});
});

test("occupant summary: counts only, plurals, biggest group first", () => {
  assert.equal(occupantSummary({ sunrise: 1, moonlighter: 2 }), "2 Moonlighters, 1 Sunrise Sipper");
  assert.equal(occupantSummary({ chill: 1 }), "1 Chill Pill");
  assert.equal(occupantSummary({}), "");
  assert.equal(occupantSummary({ hype: 0, solo: -2, tidy: Number.NaN, evil: 3 } as never), "");
  assert.deepEqual(countTypes(["solo", "solo", "x", null, "tidy"]), { solo: 2, tidy: 1 });
});

test("share link carries the Instagram story UTM tags and the type", () => {
  const u = new URL(roomieShareUrl("https://roomeo.example/", "hype"));
  assert.equal(u.pathname, "/roomie-quiz");
  assert.equal(u.searchParams.get("utm_source"), "instagram");
  assert.equal(u.searchParams.get("utm_medium"), "story");
  assert.equal(u.searchParams.get("utm_campaign"), "roomie_quiz");
  assert.equal(u.searchParams.get("utm_content"), "hype");
  assert.match(roomieShareUrl("", "solo"), /^\/roomie-quiz\?utm_source=instagram/);
  assert.equal(roomieShareLabel("https://www.roomeo.example"), "roomeo.example/roomie-quiz");
});

test("flag: explicit value wins; unset is off in production, on in preview and dev", () => {
  assert.equal(roomieQuizEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(roomieQuizEnabled({ VERCEL_ENV: "production", ROOMIE_QUIZ_ENABLED: "true" }), true);
  assert.equal(roomieQuizEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(roomieQuizEnabled({ VERCEL_ENV: "preview", ROOMIE_QUIZ_ENABLED: "false" }), false);
  assert.equal(roomieQuizEnabled({ NODE_ENV: "development" }), true);
  assert.equal(roomieQuizEnabled({ NODE_ENV: "production" }), false);
});
