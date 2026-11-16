-- Pre-launch waitlist (16 Nov 2026): homepage sign-ups while ROOMEO_WAITLIST_MODE is on.
-- One row per person (deduped on email or phone). roomie_type is the quiz result if they played (type key only,
-- never answers). consent_at is required: we only store a sign-up after the consent box is ticked.
-- Additive only, safe to re-run. Depends only on 0001 ("user"). Does NOT depend on 0027 or 0028.
-- Revert: drop table if exists waitlist_signups;
create table if not exists waitlist_signups (
  id text primary key,
  name text not null check (length(name) between 1 and 80),
  email text check (email is null or length(email) <= 254),
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  city text not null check (length(city) between 1 and 60),
  role text not null check (role in ('tenant', 'owner')),
  roomie_type text check (roomie_type is null or roomie_type in ('moonlighter', 'sunrise', 'tidy', 'hype', 'chill', 'solo')),
  source text not null default 'home' check (source in ('home', 'waitlist_page', 'quiz')),
  user_id text references "user" ("id") on delete set null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create unique index if not exists waitlist_signups_email_uq on waitlist_signups (lower(email)) where email is not null;
create unique index if not exists waitlist_signups_phone_uq on waitlist_signups (phone) where phone is not null;
create index if not exists waitlist_signups_created_idx on waitlist_signups (created_at desc);
