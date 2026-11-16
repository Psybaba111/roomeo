import test from "node:test";
import assert from "node:assert/strict";
import { orderByVibe, QUIZ_EVENTS, quizEventKind, quizEventSource } from "./quiz-events.ts";

test("only the four quiz funnel events are accepted", () => {
  assert.deepEqual([...QUIZ_EVENTS], ["quiz_start", "quiz_complete", "quiz_skip", "result_to_search"]);
  for (const k of QUIZ_EVENTS) assert.equal(quizEventKind(k), k);
  for (const bad of ["search", "QUIZ_START", "quiz_start ", "", null, 1, {}, "'; drop table x;--"]) assert.equal(quizEventKind(bad), null);
  assert.equal(quizEventSource("home"), "home");
  assert.equal(quizEventSource("evil"), "quiz_page");
});

test("orderByVibe: scored beds first (best first, deal-breakers last), the rest keep their order", () => {
  const l = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const out = orderByVibe(l, { d: { score: 90, ruleOut: false }, b: { score: 40, ruleOut: false }, e: { score: 95, ruleOut: true }, c: { score: 90, ruleOut: false } });
  assert.deepEqual(out.map((x) => x.id), ["c", "d", "b", "e", "a"]);
  assert.deepEqual(orderByVibe(l, {}).map((x) => x.id), ["a", "b", "c", "d", "e"]);
  assert.equal(l[0].id, "a"); // input not mutated
});
