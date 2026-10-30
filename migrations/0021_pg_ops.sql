-- PG operations: owner bed board, meal opt-outs, house notices. Additive only, safe to re-run.
-- Revert: drop table if exists house_notice_reads; drop table if exists house_notices; drop table if exists meal_optouts; drop table if exists pg_beds;
create table if not exists pg_beds (
  id text primary key,
  listing_id text not null,
  owner_id text not null,
  label text not null,
  status text not null default 'VACANT', -- OCCUPIED | VACANT | ON_NOTICE | BLOCKED
  tenant_id text,
  tenant_name text not null default '',
  move_in_date date,
  notice_end date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, label)
);
create index if not exists pg_beds_owner_idx on pg_beds (owner_id);
create table if not exists meal_optouts (
  user_id text not null,
  listing_id text not null,
  meal_date date not null,
  meal text not null, -- LUNCH | DINNER
  created_at timestamptz not null default now(),
  primary key (user_id, meal_date, meal)
);
create index if not exists meal_optouts_listing_idx on meal_optouts (listing_id, meal_date);
create table if not exists house_notices (
  id text primary key,
  listing_id text not null,
  owner_id text not null,
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists house_notices_listing_idx on house_notices (listing_id, created_at desc);
create table if not exists house_notice_reads (
  notice_id text not null references house_notices (id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);
