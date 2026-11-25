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

/**
 * 23 Nov 2026 (Rohith approved the QA PR): Mud Home's real beds strip above the hero, canonical + JSON-LD in head.
 * Reverting exactly these edits must give back the file below; nothing else in the page may change.
 */
/**
 * 25 Nov 2026 (Rohith, "OK go ahead"): honest credibility edits. An empty state replaces the strip when there are no
 * verified beds, and the Bengaluru "onboarding owners now" block sits under the hero. Reverting gives back 23 Nov's file.
 */
function revertCredibilityEdits(src: string) {
  return src
    .replace('import { getCityOnboarding, getFeaturedBeds, getHome, listCities } from "@/lib/roomsetu/public-api";\nimport { BengaluruOnboarding, NoVerifiedBeds } from "@/components/city-onboarding";', 'import { getFeaturedBeds, getHome, listCities } from "@/lib/roomsetu/public-api";')
    .replace('    const [home, flag, wl, featured, blr] = await Promise.all([', '    const [home, flag, wl, featured] = await Promise.all([')
    .replace(', getFeaturedBeds().catch(() => []), getCityOnboarding({ data: { city: "Bengaluru" } }).catch(() => ({ city: "Bengaluru", live: 0 }))]);', ', getFeaturedBeds().catch(() => [])]);')
    .replace("    return { home, quizHero: flag.enabled, waitlist: wl.enabled, featured, blr };", "    return { home, quizHero: flag.enabled, waitlist: wl.enabled, featured };")
    .replace("  const blr = Route.useLoaderData({ select: (d) => d.blr });\n", "")
    .replace("      {featured.length ? <MudHomeBeds rooms={featured} waitlist={waitlist} /> : <NoVerifiedBeds />}\n", "      <MudHomeBeds rooms={featured} waitlist={waitlist} />\n")
    .replace("      <BengaluruOnboarding live={blr.live} waitlist={waitlist} />\n", "");
}

function revertShareEdits(src: string) {
  return revertCredibilityEdits(src)
    .replace('import { pageHead, SHARE_DESCRIPTION, siteJsonLd } from "@/lib/seo";\nimport { OPERATOR } from "@/lib/legal";\nimport { MudHomeBeds } from "@/components/mud-home-beds";\n', 'import { pageHead, SHARE_DESCRIPTION } from "@/lib/seo";\n')
    .replace('import { getFeaturedBeds, getHome, listCities } from "@/lib/roomsetu/public-api";', 'import { getHome, listCities } from "@/lib/roomsetu/public-api";')
    .replace('  head: () => ({\n    ...pageHead("Spare PG beds for working professionals", {\n      description: SHARE_DESCRIPTION,\n      path: "/",\n    }),\n    scripts: [{ type: "application/ld+json", children: JSON.stringify(siteJsonLd(OPERATOR)) }],\n  }),\n', '  head: () =>\n    pageHead("Spare PG beds for working professionals", {\n      description: SHARE_DESCRIPTION,\n    }),\n')
    .replace(', getWaitlistMode().catch(() => ({ enabled: false })), getFeaturedBeds().catch(() => [])]);', ', getWaitlistMode().catch(() => ({ enabled: false }))]);')
    .replace("    return { home, quizHero: flag.enabled, waitlist: wl.enabled, featured };", "    return { home, quizHero: flag.enabled, waitlist: wl.enabled };")
    .replace("  const featured = Route.useLoaderData({ select: (d) => d.featured });\n", "")
    .replace("      <MudHomeBeds rooms={featured} waitlist={waitlist} />\n", "");
}

/** Map the current file back onto main by reverting the whitelisted edits (quiz hero slot, waitlist mode). */
function revertQuizEdits(src: string) {
  return revertShareEdits(src)
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
