# Roomie quiz + Vibe match

Optional tenant quiz (9 questions + 1 optional, about 2 minutes) that gives one of 6 original Roomeo roomie types,
and a 0–100% **Vibe match** between a seeker and the people already living in a bed's listing.

## Flag
`ROOMIE_QUIZ_ENABLED` (server env).
- Unset: **on** for Vercel Preview and local dev, **off** in Production (`VERCEL_ENV=production`).
- `true` / `false` overrides in any environment.
- Off: `/roomie-quiz` shows "coming soon", no listing section, no badges, saves are refused. Delete always works.

To go live: apply `migrations/0028_roomie_quiz.sql` to production, then set `ROOMIE_QUIZ_ENABLED=true` (Production) and redeploy.

## Types
Moonlighter 🌙 · Sunrise Sipper ☀️ · Tidy Titan 🧽 · Hype Host 🎉 · Chill Pill 🌿 · Solo Mode 🎧
(original names, copy and "room blob" mascot art; no MyRoomeo text or mascots).

## Questions and weights (`src/lib/roomsetu/roomie-match-config.ts`)
| Group | Questions | Weight |
|---|---|---|
| Must match | sleep, clean, smoke (smoking/drinking), food (veg/non-veg), guests | 5 |
| Should be close | noise, ac (AC temperature), social, hours (work/study) | 3 |
| Can differ (optional question) | vibe (hobbies & music) | 1 |

Hard rule-outs (config `hardClashes`): smoker vs "needs a smoke-free room"; strict veg (veg-only kitchen) vs non-veg.

## Scoring (`src/lib/roomsetu/roomie-match.ts`)
Pair (seeker vs one occupant), over the questions both answered with weight w > 0:
- scale questions: s = 1 − |a − b| / 3 ("Don't mind" = 1); category questions: same = 1, else `categoryMiss` (0.5)
- pair = 100 × Σ(w·s) / Σ(w)
- if both answered less than `minCoverage` (60%) of the total weight → no score
- hard clash → pair = min(pair, `pairHardClashCap` = 15), flagged

Room, exact cap rule:
```
avg   = mean(pair scores)       worst = min(pair scores)
room  = round(clamp(min(avg, worst + worstPairMargin), 0, 100))     worstPairMargin = 25
```
One occupant: room = that pair. Any hard clash keeps the room ≤ 40% and marks it "deal-breaker".
No seeker quiz, empty room, or no occupant with a quiz → no score, badge hidden.

"Current occupants": OCCUPIED / ON_NOTICE beds on the owner's bed board, plus confirmed 1:1 or squad move-ins
with no move-out recorded. The seeker is never matched with themself.

Lines: heads-up when any occupant is far apart on a question (similarity ≤ 0.34) or on a hard clash;
"why you'll click" when the room's average similarity is ≥ 0.84, topped up to 2 lines from the next-closest
questions (≥ 0.6). Max 3 of each. Copy is generic: no names, no answers.

## Privacy
- Answers live in `roomie_profiles` and are only returned to their owner. Others see the type (hosts on their own
  requests), counts per type on listings (no names), and the score.
- Saving needs an explicit consent tick; `consent_at` is stored.
- Delete (quiz page or profile) removes answers, type and the user's success signals. Account deletion cascades.

## Success signals
`roomie_match_signals` (kind `STAY_60`): one row per tenant per listing once a tenant with a saved type has stayed
60+ days, with their score against co-occupants at that moment, `config_version`, occupant count and type.
Written idempotently when the listing's roomie section loads. For tuning the weights later, no ML.

## Rollback
- Feature: set `ROOMIE_QUIZ_ENABLED=false` (or leave it unset in Production), or revert the PR.
- DB: `drop table if exists roomie_match_signals; drop table if exists roomie_profiles;` (additive tables only).
