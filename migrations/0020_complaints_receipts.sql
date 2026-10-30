-- Complaints tracker + monthly rent receipts. Additive only, safe to re-run.
-- Revert: drop table if exists owner_receipt_profiles; drop table if exists rent_receipts_manual; drop table if exists complaints;
create table if not exists complaints (
  id text primary key,
  listing_id text not null,
  tenant_id text not null,
  owner_id text not null,
  category text not null, -- AC | ELECTRICAL | PLUMBING | WIFI | FOOD | CLEANING | FURNITURE | SECURITY | OTHER
  description text not null,
  photo_base64 text,
  status text not null default 'OPEN', -- OPEN | IN_PROGRESS | FIXED | CLOSED
  owner_note text not null default '',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  fixed_at timestamptz,
  confirmed_at timestamptz,
  rating integer check (rating between 1 and 5),
  rating_note text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists complaints_owner_idx on complaints (owner_id, status);
create index if not exists complaints_tenant_idx on complaints (tenant_id);
-- Owner-marked rent payments (used when there's no AutoPay rent_entries row for that month).
create table if not exists rent_receipts_manual (
  id text primary key,
  move_in_id text not null,
  listing_id text not null,
  owner_id text not null,
  tenant_id text not null,
  month text not null, -- YYYY-MM
  amount_inr integer not null check (amount_inr > 0),
  paid_on date not null,
  method text not null default 'UPI', -- UPI | BANK | CASH
  ref text not null default '',
  created_at timestamptz not null default now(),
  unique (move_in_id, month)
);
create index if not exists rent_receipts_manual_tenant_idx on rent_receipts_manual (tenant_id);
create index if not exists rent_receipts_manual_owner_idx on rent_receipts_manual (owner_id);
-- What the owner wants printed as landlord on receipts. PAN optional.
create table if not exists owner_receipt_profiles (
  owner_id text primary key,
  landlord_name text not null,
  pan text not null default '',
  address text not null default '',
  updated_at timestamptz not null default now()
);
