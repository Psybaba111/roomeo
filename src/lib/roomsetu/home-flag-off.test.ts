// Flag off ⇒ the homepage is exactly what it was before the quiz hero (main @ d046d48).
// The golden file is a verbatim copy of src/routes/index.tsx from main. This test undoes the ONLY permitted edits
// (the hero slot + loader shape) and requires everything else, including every line of the classic hero, to match.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../routes/", import.meta.url);
const golden = readFileSync(new URL("__snapshots__/index.flag-off.golden.tsx.txt", root), "utf8");
const current = readFileSync(new URL("index.tsx", root), "utf8");

function body(src: string, from: string, to: string) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `missing ${from}`);
  return src.slice(a, b);
}

/** Map the current file back onto main by reverting the whitelisted edits (quiz hero slot, waitlist mode). */
function revertQuizEdits(src: string) {
  return src
    .replace('import { useEffect, useState, type ReactNode } from "react";', 'import { useEffect, useState } from "react";')
    .replace('import { getRoomieQuizFlag } from "@/lib/roomsetu/roomie-quiz-api";\nimport { QuizHero } from "@/components/quiz-hero";\nimport { getWaitlistMode } from "@/lib/roomsetu/waitlist-api";\nimport { WaitlistSection } from "@/components/waitlist-form";\n', "")
    .replace(/ {2}\/\/ ROOMIE_QUIZ_ENABLED decides the hero\.[^\n]*\n {2}loader: async \(\) => \{\n[^\n]*\n[^\n]*\n {2}\},\n {2}component: HomeRoute,\n\}\);\n\nfunction HomeRoute\(\) \{\n(?:[^\n]*\n){5}\}\n/, "  loader: () => getHome({ data: { city: DEFAULT_CITY } }),\n  component: Home,\n});\n")
    .replace("function Home({ hero, waitlist = false }: { hero?: (city: string) => ReactNode; waitlist?: boolean }) {\n  const initialData = Route.useLoaderData({ select: (d) => d.home });", "function Home() {\n  const initialData = Route.useLoaderData();")
    .replace("      {hero ? hero(city) : (\n", "")
    .replace("      </section>\n      )}\n      {waitlist ? <WaitlistSection city={city} /> : null}\n", "      </section>\n")
    .replace("      {waitlist ? null : (\n      <section className=\"mt-12\">\n        <div className=\"mb-4", "      <section className=\"mt-12\">\n        <div className=\"mb-4")
    .replace("        ) : null}\n      </section>\n      )}\n\n", "        ) : null}\n      </section>\n\n");
}

test("flag off: index.tsx is main's homepage plus only the whitelisted hero slot", () => {
  assert.equal(revertQuizEdits(current), golden);
});

test("flag off: the classic hero markup is byte-identical to main", () => {
  const start = '      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[#2a0a4a]';
  const hero = (s: string) => body(s, start, "      </section>\n");
  assert.equal(hero(current), hero(golden));
  assert.match(hero(current), /Find beds →/);
  assert.match(hero(current), /Got a spare bed\? List it/);
});

test("the classic hero is what renders whenever no hero override is passed (flag off)", () => {
  assert.match(current, /return quizHero \? <Home hero=\{\(city\) => <QuizHero city=\{city\} \/>\} \/> : <Home \/>;/);
  // Waitlist mode only ever applies when the loader's waitlist flag is true (ROOMEO_WAITLIST_MODE).
  assert.match(current, /if \(waitlist\) return <Home hero=\{\(city\) => <QuizHero city=\{city\} waitlist \/>\} waitlist \/>;/);
  assert.match(current, /\{hero \? hero\(city\) : \(\n {6}<section className="relative left-1\/2/);
});
