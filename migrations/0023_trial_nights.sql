-- Trial nights (Rohith, 1 Nov 2026): owners may offer 1-3 paid trial nights per listing.
-- Roomeo charges a ₹99 (GST included) service fee per trial booking through UPI + admin approval.
-- Nightly stay money goes straight to the owner; Roomeo never holds it.
-- Revert: drop table if exists trial_bookings; alter table listings drop column if exists trial_nights_enabled, drop column if exists trial_nightly_inr;
--         alter table payments drop column if exists trial_booking_id, drop column if exists trial_credit_inr, drop column if exists trial_credit_booking_id;
alter table listings add column if not exists trial_nights_enabled boolean not null default false;
alter table listings add column if not exists trial_nightly_inr integer check (trial_nightly_inr is null or (trial_nightly_inr between 1 and 100000));

create table if not exists trial_bookings (
  id text primary key,
  listing_id text not null,
  seeker_id text not null,
  owner_id text not null,
  check_in date not null,
  nights integer not null check (nights between 1 and 3),
  nightly_inr integer not null check (nightly_inr > 0),
  stay_total_inr integer not null check (stay_total_inr > 0),
  status text not null default 'FEE_PENDING' check (status in ('FEE_PENDING','CONFIRMED','CANCELLED','COMPLETED')),
  id_checked_at timestamptz,
  fee_payment_id text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists trial_bookings_seeker_idx on trial_bookings (seeker_id, created_at desc);
create index if not exists trial_bookings_listing_idx on trial_bookings (listing_id, check_in);
-- One open trial per seeker per listing.
create unique index if not exists trial_bookings_one_open on trial_bookings (listing_id, seeker_id) where status in ('FEE_PENDING','CONFIRMED');

alter table payments add column if not exists trial_booking_id text;
-- ₹ knocked off a tenant's ₹589 fee for a paid trial (one credit per trial booking).
alter table payments add column if not exists trial_credit_inr integer not null default 0;
alter table payments add column if not exists trial_credit_booking_id text;
create unique index if not exists payments_trial_credit_once on payments (trial_credit_booking_id)
  where trial_credit_booking_id is not null and status in ('PENDING','SUBMITTED','PAID');
