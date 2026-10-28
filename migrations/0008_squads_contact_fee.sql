-- Contact unlock fee (seeker pays Roomeo once per listing; squads pay once per listing)
-- and squads (2-4 seekers renting an entire flat together). Additive only.

alter table listings add column if not exists listing_kind text not null default 'BED';
alter table listings add column if not exists bedrooms integer;

alter table payments add column if not exists kind text not null default 'PLAN';
alter table payments add column if not exists listing_id text;
alter table payments add column if not exists squad_id text;
-- One open contact checkout per payer + listing (+ squad).
create unique index if not exists payments_open_contact_key on payments (user_id, listing_id, coalesce(squad_id, ''))
  where provider = 'UPI' and kind = 'CONTACT' and status in ('PENDING', 'SUBMITTED');

create table if not exists squads (
  id text primary key,
  creator_id text not null,
  name text not null,
  area text not null,
  budget_per_person integer not null,
  move_in date,
  size integer not null check (size between 2 and 4),
  invite_code text not null unique,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists squad_members (
  squad_id text not null references squads(id) on delete cascade,
  user_id text not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (squad_id, user_id)
);
create index if not exists squad_members_user_idx on squad_members (user_id) where left_at is null;

create table if not exists squad_shortlist (
  squad_id text not null references squads(id) on delete cascade,
  listing_id text not null,
  added_by text not null,
  created_at timestamptz not null default now(),
  primary key (squad_id, listing_id)
);

create table if not exists squad_votes (
  squad_id text not null references squads(id) on delete cascade,
  listing_id text not null,
  user_id text not null,
  vote boolean not null,
  updated_at timestamptz not null default now(),
  primary key (squad_id, listing_id, user_id)
);

create table if not exists squad_requests (
  id text primary key,
  squad_id text not null references squads(id) on delete cascade,
  listing_id text not null,
  owner_id text not null,
  status text not null default 'PENDING',
  owner_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (squad_id, listing_id)
);
create index if not exists squad_requests_owner_idx on squad_requests (owner_id, status);

-- Paid contact. Exactly one of seeker_id / squad_id is set.
create table if not exists contact_unlocks (
  id text primary key,
  listing_id text not null,
  seeker_id text,
  squad_id text,
  payment_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists contact_unlocks_seeker_key on contact_unlocks (listing_id, seeker_id) where seeker_id is not null;
create unique index if not exists contact_unlocks_squad_key on contact_unlocks (listing_id, squad_id) where squad_id is not null;

alter table conversations add column if not exists squad_id text;
