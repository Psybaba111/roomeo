-- Roomie-type quiz (16 Nov 2026): an optional tenant quiz that maps to one of 6 original roomie types.
-- Answers live in their own table so nothing that joins profiles can leak them: other people only ever
-- see type_key (on a booking request, or aggregated per listing with no names). Saved only after explicit
-- consent (consent_at), deleted by the user at any time (row delete). Behind ROOMIE_QUIZ_ENABLED.
-- Additive only, safe to re-run. Revert: drop table if exists roomie_match_signals; drop table if exists roomie_profiles;
create table if not exists roomie_profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  type_key text not null check (type_key in ('moonlighter', 'sunrise', 'tidy', 'hype', 'chill', 'solo')),
  answers jsonb not null default '{}'::jsonb,
  quiz_version integer not null default 1,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists roomie_profiles_type_idx on roomie_profiles (type_key);

-- Success signals for tuning the "Vibe match" weights later (no ML): one row when a tenant with a saved type
-- has stayed 60+ days in a listing, with the score they had against their co-occupants at that point.
-- No answers here. Rows go when the user deletes their quiz (app) or their account (cascade).
-- Revert: drop table if exists roomie_match_signals;
create table if not exists roomie_match_signals (
  id text primary key,
  kind text not null default 'STAY_60' check (kind in ('STAY_60')),
  listing_id text not null,
  tenant_id text not null references "user" ("id") on delete cascade,
  tenant_type text not null,
  score integer check (score between 0 and 100),
  rule_out boolean not null default false,
  occupants_n integer not null default 0,
  config_version integer not null,
  stay_started_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (kind, listing_id, tenant_id)
);
