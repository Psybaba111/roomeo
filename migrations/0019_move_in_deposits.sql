-- Digital move-in (details, private ID, e-signed stay agreement, police form) + deposit records. Additive only, safe to re-run.
-- Revert: drop table if exists deposit_deductions; drop table if exists deposits; drop table if exists movein_signatures; drop table if exists movein_id_docs; drop table if exists movein_details; drop table if exists movein_invites;
create table if not exists movein_invites (
  id text primary key,
  token text not null unique,
  listing_id text not null,
  owner_id text not null,
  tenant_id text,
  bed_label text not null default '',
  rent_inr integer not null check (rent_inr > 0),
  deposit_inr integer not null default 0 check (deposit_inr >= 0),
  start_date date not null,
  min_stay_months integer not null default 3,
  notice_days integer not null default 30,
  house_rules text not null default '',
  status text not null default 'SENT', -- SENT | SUBMITTED | SIGNED | CANCELLED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists movein_invites_owner_idx on movein_invites (owner_id);
create index if not exists movein_invites_tenant_idx on movein_invites (tenant_id);
-- What the tenant filled in. Only the last 4 digits of the ID number are ever stored.
create table if not exists movein_details (
  invite_id text primary key,
  full_name text not null,
  phone text not null,
  email text not null default '',
  date_of_birth date,
  occupation text not null default '',
  employer text not null default '',
  home_address text not null,
  home_city text not null,
  home_state text not null,
  home_pincode text not null,
  emergency_name text not null default '',
  emergency_phone text not null default '',
  id_type text not null, -- AADHAAR | OFFICE_ID | PASSPORT | DL | VOTER
  id_last4 text not null,
  outside_mangaluru boolean not null default false,
  submitted_at timestamptz not null default now()
);
-- The ID photo. Private: only served through an owner/tenant-checked server function, never a public URL.
create table if not exists movein_id_docs (
  invite_id text primary key,
  mime text not null,
  data_base64 text not null,
  uploaded_at timestamptz not null default now()
);
-- Typed-name e-sign of the leave-and-licence agreement.
create table if not exists movein_signatures (
  invite_id text primary key,
  typed_name text not null,
  signed_at timestamptz not null default now(),
  ip text not null default '',
  user_agent text not null default '',
  agreement_sha256 text not null
);
create table if not exists deposits (
  id text primary key,
  invite_id text not null unique,
  owner_id text not null,
  tenant_id text,
  amount_inr integer not null check (amount_inr >= 0),
  received_on date not null,
  checkout_on date,
  refund_due_on date,
  status text not null default 'HELD', -- HELD | REFUND_DUE | REFUNDED
  refunded_inr integer,
  refunded_on date,
  refund_ref text not null default '',
  tenant_ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deposits_owner_idx on deposits (owner_id);
create index if not exists deposits_tenant_idx on deposits (tenant_id);
create table if not exists deposit_deductions (
  id text primary key,
  deposit_id text not null references deposits (id) on delete cascade,
  amount_inr integer not null check (amount_inr > 0),
  reason text not null,
  photo_base64 text,
  tenant_ack_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deposit_deductions_deposit_idx on deposit_deductions (deposit_id);
