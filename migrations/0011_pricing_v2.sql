-- Pricing v2: free contact quota, time passes, squad pass, host boost, fast track, move in + success fee.
-- Additive only. The old per listing contact fee keeps working when ROOMEO_CONTACT_MODEL=PER_LISTING_FEE.

-- Every owner contact is a row in contact_unlocks. New columns describe how it was paid for and how it ended.
alter table contact_unlocks add column if not exists source text not null default 'PAID'; -- PAID | FREE | PASS
alter table contact_unlocks add column if not exists pass_id text;
alter table contact_unlocks add column if not exists outcome text;            -- null | REPLIED | DECLINED | NO_REPLY
alter table contact_unlocks add column if not exists outcome_at timestamptz;
alter table contact_unlocks add column if not exists restored_at timestamptz; -- free contact given back
create index if not exists contact_unlocks_open_idx on contact_unlocks (created_at) where outcome is null;
create index if not exists contact_unlocks_pass_idx on contact_unlocks (pass_id) where pass_id is not null;

alter table payments add column if not exists pass_code text; -- WEEKLY | MONTHLY | SQUAD for pass payments

create table if not exists contact_passes (
  id text primary key,
  user_id text,
  squad_id text,
  code text not null,                 -- WEEKLY | MONTHLY | SQUAD
  payment_id text,
  listing_id text,                    -- squad passes: the listing whose request was paid for
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'ACTIVE', -- ACTIVE | SETTLED | REFUND_DUE
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists contact_passes_user_idx on contact_passes (user_id, ends_at);
create index if not exists contact_passes_squad_idx on contact_passes (squad_id, ends_at);

alter table listings add column if not exists boosted_until timestamptz;
alter table profiles add column if not exists fast_track_at timestamptz;

create table if not exists move_ins (
  id text primary key,
  application_id text unique,
  listing_id text not null,
  seeker_id text not null,
  owner_id text not null,
  seeker_confirmed_at timestamptz,
  owner_confirmed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists move_ins_confirmed_idx on move_ins (confirmed_at);
