-- Bring a roommate, both save ₹500. Additive only, safe to re-run.
-- Revert: drop table if exists referral_credits; drop table if exists referrals; drop table if exists referral_codes;
create table if not exists referral_codes (
  user_id text primary key,
  code text not null unique,
  created_at timestamptz not null default now()
);
-- One referrer per referee, ever. completed_at is set when the referee's first move-in is confirmed by both sides.
create table if not exists referrals (
  id text primary key,
  referrer_id text not null,
  referee_id text not null unique,
  code text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  application_id text
);
create index if not exists referrals_referrer_idx on referrals (referrer_id);
-- ₹ off the first month's rent. One credit per user per referral.
create table if not exists referral_credits (
  id text primary key,
  user_id text not null,
  referral_id text not null,
  amount_inr integer not null,
  reason text not null default '',
  status text not null default 'AVAILABLE',
  created_at timestamptz not null default now(),
  unique (user_id, referral_id)
);
create index if not exists referral_credits_user_idx on referral_credits (user_id);
