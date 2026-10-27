-- Identity (DigiLocker or a recorded desk pass) and the flat rent fee.

alter table profiles add column if not exists identity_status text not null default 'UNVERIFIED';
alter table profiles add column if not exists identity_source text not null default '';
alter table profiles add column if not exists identity_attempts integer not null default 0;
alter table profiles add column if not exists digilocker_id text;

alter table conversations add column if not exists closed_at timestamptz;

create table if not exists identity_oauth (
  state text primary key,
  user_id text not null,
  expires_at timestamptz not null
);

create table if not exists rent_agreements (
  id text primary key,
  application_id text not null unique,
  listing_id text not null,
  seeker_id text not null,
  host_id text not null,
  rent_inr integer not null,
  deposit_inr integer not null,
  seeker_ok boolean not null default false,
  host_ok boolean not null default false,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payments add column if not exists fee_inr integer not null default 0;
alter table payments add column if not exists rent_inr integer not null default 0;
alter table payments add column if not exists host_payout_inr integer not null default 0;
alter table payments add column if not exists agreement_id text;
alter table payments add column if not exists payout_status text not null default '';
alter table payments add column if not exists provider_payment text;
