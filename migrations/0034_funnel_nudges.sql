-- Funnel event log, owner nudge log, three Bengaluru areas (25 Nov 2026). Additive only, safe to re-run.
-- Does NOT need 0027, 0032 or 0033. The app works without this file: it skips the log / nudges while the tables are
-- missing (prod until someone approves running it there) and the admin funnel falls back to counts from DB state.
-- Revert: drop table if exists owner_nudges; drop table if exists funnel_events;
--         delete from localities where id in ('00000000-0000-4000-8000-000000000b04','…b05','…b06');
create table if not exists funnel_events (
  id text primary key,
  kind text not null check (kind in ('request_submitted', 'owner_responded', 'request_accepted', 'payment_completed', 'moved_in')),
  -- What the row is about (application / payment / move-in id). One row per kind + ref, so re-runs never double count.
  ref_id text not null,
  listing_id text,
  city text not null default '' check (length(city) <= 60),
  -- The person the step happened to (seeker for most steps, payer for payments). Used only to hand the event to
  -- that person's own browser for GA (no names, phones or emails are stored here).
  user_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists funnel_events_kind_ref_key on funnel_events (kind, ref_id);
create index if not exists funnel_events_kind_created_idx on funnel_events (kind, created_at);
create index if not exists funnel_events_user_idx on funnel_events (user_id, created_at);

-- At most one owner reminder per request (primary key). HELD = queued while MAPPSTORE_NOTIFY_ENABLED (or the
-- template) is off; it can be sent once later. SENDING is the claim; SENT / FAILED / SKIPPED are final.
create table if not exists owner_nudges (
  application_id text primary key references applications (id) on delete cascade,
  owner_id text not null,
  listing_id text not null,
  status text not null check (status in ('HELD', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  reason text not null default '' check (length(reason) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists owner_nudges_status_idx on owner_nudges (status, created_at);

insert into localities (id, city_id, name, lat, lng)
select v.id, c.id, v.name, v.lat, v.lng
from (values
  ('00000000-0000-4000-8000-000000000b04', 'BTM Layout', 12.9166, 77.6101),
  ('00000000-0000-4000-8000-000000000b05', 'Marathahalli', 12.9569, 77.7011),
  ('00000000-0000-4000-8000-000000000b06', 'Manyata Tech Park', 13.0475, 77.6210)
) as v (id, name, lat, lng)
join cities c on c.name = 'Bengaluru'
where not exists (
  select 1 from localities l where l.city_id = c.id and lower(l.name) = lower(v.name)
)
on conflict (id) do nothing;
