-- In-app click-to-sign deal agreement (tenant + owner). Additive only.
-- Revert: drop table if exists deal_agreements;  (payments.agreement_id already exists since 0004)
create table if not exists deal_agreements (
  id text primary key,
  application_id text not null unique,
  listing_id text not null,
  seeker_id text not null,
  owner_id text not null,
  terms_json text not null,
  body text not null,
  seeker_signed_at timestamptz,
  seeker_name text,
  seeker_ip text,
  owner_signed_at timestamptz,
  owner_name text,
  owner_ip text,
  issued_at timestamptz,            -- both signed: the deal exists from here
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  created_at timestamptz not null default now()
);
create index if not exists deal_agreements_seeker_idx on deal_agreements (seeker_id);
create index if not exists deal_agreements_owner_idx on deal_agreements (owner_id);
create index if not exists payments_agreement_idx on payments (agreement_id) where agreement_id is not null;
