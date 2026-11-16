# Waitlist mode (pre-launch)

Env flag `ROOMEO_WAITLIST_MODE`. Only `true` / `1` / `on` turns it on; **unset = exactly today's behaviour**
(checked by `home-flag-off.test.ts` against main's homepage, and by a local SSR + screenshot diff vs main).

## With the flag on
| Area | Behaviour |
|---|---|
| Homepage | Quiz game hero (even if `ROOMIE_QUIZ_ENABLED` is off) → waitlist form (`#waitlist`). "Just show me beds" becomes "Skip the game, join the waitlist". "Fresh beds" is hidden. The quiz result CTA is "Join the waitlist as a <type>" and the type is saved with the sign-up. |
| /search | Redirects to `/waitlist` for everyone except admins. |
| /listing/$id | Redirects signed-out visitors to `/waitlist`. Signed-in people still see listing pages (existing requests, chats, deals). |
| /waitlist | "Launching soon" page with the same form (noindex). With the flag off it redirects to `/`. |
| sitemap.xml | Only `/`, `/waitlist`, `/pricing`, `/privacy`, `/terms` (no search or listing URLs). |
| Still working | Sign-in/up, owner listing creation, dashboard, applications, inbox, deal flows, /admin, /pricing, legal pages, /roomie-quiz. |
| Admin | `/admin/waitlist`: totals, list, CSV download (formula-injection safe). Works with the flag on or off. |

## Storage
Migration `0029_waitlist_signups.sql` (additive; needs only 0001 for `"user"`; not 0027 or 0028).
One row per person, deduped on lower(email) or phone; consent required (`consent_at not null`); `roomie_type` is the
quiz type key only (never answers). Each new sign-up writes `metric_events` kind `waitlist_join` (+ a
`waitlist.join` runtime log line). Flood guard: 300 new sign-ups per 10 minutes, site-wide.

```sql
select role, count(*) from waitlist_signups group by role;
select count(*) from metric_events where kind = 'waitlist_join';
```

Revert: unset the flag (instant, after redeploy). Data: `drop table if exists waitlist_signups;` (only with an OK).
