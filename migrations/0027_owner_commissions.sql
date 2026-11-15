-- Owner placement commission (Rohith, 15 Nov 2026): owners pay 20% of one month's rent (15% for founding
-- partners, per host, with an end date) for each tenant who moves in through Roomeo; tenants pay nothing.
-- Only written while OWNER_FEE_ENABLED is on and the flat success fee is off. Additive only, safe to re-run.
-- Revert: drop table if exists owner_commissions; drop table if exists host_fee_settings;
create table if not exists host_fee_settings (
  owner_id text primary key,
  founding_partner boolean not null default false,
  founding_until date,
  note text not null default '',
  set_by text,
  set_at timestamptz not null default now()
);
create table if not exists owner_commissions (
  id text primary key,
  move_in_id text not null unique,
  listing_id text not null,
  owner_id text not null,
  tenant_id text not null,
  first_enquiry_at timestamptz not null,
  move_in_on date not null,
  attribution_days integer not null check (attribution_days between 0 and 60),
  rent_inr integer not null check (rent_inr > 0),
  rate_pct integer not null check (rate_pct between 1 and 100),
  founding_rate boolean not null default false,
  fee_inr integer not null check (fee_inr > 0),
  gst_pct integer not null default 18,
  gst_inr integer not null default 0,
  total_inr integer not null,
  basis_on date not null,
  due_on date not null,
  status text not null default 'due' check (status in ('due', 'paid', 'refunded_50')),
  payment_link_mode text not null default 'stub',
  payment_link_ref text not null default '',
  paid_on date,
  paid_ref text not null default '',
  paid_recorded_by text,
  vacated_on date,
  refund_inr integer,
  refunded_on date,
  refund_ref text not null default '',
  refund_recorded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists owner_commissions_owner_idx on owner_commissions (owner_id);
create index if not exists owner_commissions_status_idx on owner_commissions (status, due_on);
