-- Rent AutoPay (UPI AutoPay via Cashfree Subscriptions). Additive only, safe to re-run.
-- Revert: drop table if exists rent_outbox; drop table if exists rent_webhook_events; drop table if exists rent_entries; drop table if exists rent_mandates; drop table if exists rent_plans;
-- One plan per renter per bed: how much, which day of the month.
create table if not exists rent_plans (
  id text primary key,
  listing_id text not null,
  bed_label text not null default '',
  move_in_id text unique,
  renter_id text not null,
  owner_id text not null,
  amount_inr integer not null check (amount_inr > 0),
  due_day integer not null check (due_day between 1 and 28),
  status text not null default 'ACTIVE', -- ACTIVE | ENDED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rent_plans_owner_idx on rent_plans (owner_id);
create index if not exists rent_plans_renter_idx on rent_plans (renter_id);
create index if not exists rent_plans_listing_idx on rent_plans (listing_id);
-- The UPI AutoPay mandate behind a plan. subscription_id is ours (sent to Cashfree), cf_subscription_id is theirs.
create table if not exists rent_mandates (
  id text primary key,
  plan_id text not null,
  provider text not null default 'CASHFREE',
  subscription_id text not null unique,
  cf_subscription_id text,
  status text not null default 'INITIALIZED', -- Cashfree subscription_status, e.g. INITIALIZED, ACTIVE, ON_HOLD, CANCELLED
  max_amount_inr integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rent_mandates_plan_idx on rent_mandates (plan_id);
-- One row per plan per month. Only provider-confirmed autopay rows count toward the on-time badge.
create table if not exists rent_entries (
  id text primary key,
  plan_id text not null,
  month text not null, -- YYYY-MM
  due_date date not null,
  amount_inr integer not null,
  status text not null default 'PENDING', -- PENDING | PAID | FAILED
  source text not null default 'autopay', -- autopay | upi_manual
  provider_ref text, -- our Cashfree payment_id, or the 12-digit UTR for upi_manual
  cf_payment_id text,
  attempts integer not null default 0,
  notified_at timestamptz,
  charge_requested_at timestamptz,
  paid_at timestamptz,
  provider_confirmed boolean not null default false,
  fallback_link_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, month)
);
create index if not exists rent_entries_provider_ref_idx on rent_entries (provider_ref);
-- Idempotent webhook log: the same event delivered twice is processed once.
create table if not exists rent_webhook_events (
  event_key text primary key,
  provider text not null default 'CASHFREE',
  event_type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
-- WhatsApp messages the scheduler wants to send. Queued only; nothing sends them until a sender is wired and approved.
create table if not exists rent_outbox (
  id text primary key,
  dedupe_key text not null unique,
  user_id text not null,
  template text not null,
  params jsonb not null default '[]'::jsonb,
  status text not null default 'QUEUED',
  created_at timestamptz not null default now()
);
