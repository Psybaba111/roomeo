-- Owner ₹499 after deposit + advance, and referral fee credits (Rohith, 17 Nov 2026, 10:05 PM IST).
-- Additive and safe to re-run. Nothing here charges anyone: every behaviour is behind flags that default OFF
-- (OWNER_FEE_ENABLED, ROOMEO_REFERRAL_CREDITS_ENABLED).
--
-- 1. deposit_marks: the owner (or an admin) marks "deposit + rent advance received" on an accepted request.
--    One row per request (application_id unique), so marking twice never charges twice. Undo keeps the row
--    (undone_at set) so the history stays; marking again reuses the same row.
-- 2. fee_credit_events: append-only audit trail for credits and deposit marks.
-- 3. referral_credits (from 0017) gains the fee-credit ledger columns. Legacy 0017 rows (₹500 off rent,
--    status 'AVAILABLE', kind 'rent_legacy') are untouched.
-- 4. fee_credit_applications: signed ledger of credit applied (+) to / restored (−) from a fee.
-- 5. payments.credit_applied_inr; owner_commissions trigger/deposit/void/credit columns and two new
--    statuses: 'waived' (founding partner, ₹0) and 'void' (deposit mark undone before payment).
--    The owner_commissions part only runs where 0027 is applied (NOT on prod today). If 0027 is applied to prod
--    later, re-run 0030's and this file's owner_commissions blocks afterwards (they no-op without the table).
--
-- Revert (only if no rows depend on it):
--   drop table if exists fee_credit_applications; drop table if exists fee_credit_events; drop table if exists deposit_marks;
--   alter table payments drop column if exists credit_applied_inr;
--   alter table referral_credits drop column if exists kind, drop column if exists referrer_id, drop column if exists friend_id,
--     drop column if exists issued_by, drop column if exists note, drop column if exists applied_at, drop column if exists voided_at,
--     drop column if exists voided_by, drop column if exists void_reason, drop column if exists updated_at;
--   (owner_commissions: drop the *_v2_check constraints, re-add 0027's checks, drop the added columns.)

create table if not exists deposit_marks (
  id text primary key,
  application_id text not null unique,
  listing_id text not null,
  owner_id text not null,
  tenant_id text not null,
  received_on date not null,
  marked_at timestamptz not null default now(),
  marked_by text not null,
  marked_role text not null check (marked_role in ('owner', 'admin')),
  undone_at timestamptz,
  undone_by text,
  undo_reason text not null default '',
  mark_count integer not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists deposit_marks_owner_idx on deposit_marks (owner_id);

create table if not exists fee_credit_events (
  id text primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  actor_id text not null,
  user_id text,
  amount_inr integer,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists fee_credit_events_entity_idx on fee_credit_events (entity, entity_id);
create index if not exists fee_credit_events_created_idx on fee_credit_events (created_at desc);

-- 0017 table, created here too so this file works on a database without 0017.
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
alter table referral_credits add column if not exists kind text not null default 'rent_legacy';
alter table referral_credits add column if not exists referrer_id text;
alter table referral_credits add column if not exists friend_id text;
alter table referral_credits add column if not exists issued_by text;
alter table referral_credits add column if not exists note text not null default '';
alter table referral_credits add column if not exists applied_at timestamptz;
alter table referral_credits add column if not exists voided_at timestamptz;
alter table referral_credits add column if not exists voided_by text;
alter table referral_credits add column if not exists void_reason text not null default '';
alter table referral_credits add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'referral_credits_fee_status_check') then
    alter table referral_credits add constraint referral_credits_fee_status_check
      check (kind <> 'fee_credit' or (status in ('issued', 'applied', 'void') and amount_inr > 0));
  end if;
end $$;
create index if not exists referral_credits_fee_idx on referral_credits (user_id, created_at) where kind = 'fee_credit';

create table if not exists fee_credit_applications (
  id text primary key,
  credit_id text not null,
  user_id text not null,
  fee_kind text not null check (fee_kind in ('tenant_fee', 'owner_fee')),
  fee_id text not null,
  -- + applied to the fee, − restored to the credit (fee voided / refunded / halved).
  amount_inr integer not null check (amount_inr <> 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists fee_credit_applications_credit_idx on fee_credit_applications (credit_id);
create index if not exists fee_credit_applications_fee_idx on fee_credit_applications (fee_kind, fee_id);

alter table payments add column if not exists credit_applied_inr integer not null default 0;

do $$
begin
  if to_regclass('public.owner_commissions') is not null then
    alter table owner_commissions add column if not exists trigger_kind text not null default 'move_in';
    alter table owner_commissions add column if not exists deposit_mark_id text;
    alter table owner_commissions add column if not exists credit_applied_inr integer not null default 0;
    alter table owner_commissions add column if not exists voided_at timestamptz;
    alter table owner_commissions add column if not exists voided_by text;
    alter table owner_commissions add column if not exists void_reason text not null default '';
    -- Replace the status and fee checks (0027's, or 0031's if that PR's migration ran first).
    alter table owner_commissions drop constraint if exists owner_commissions_status_check;
    alter table owner_commissions drop constraint if exists owner_commissions_status_waived_check;
    alter table owner_commissions drop constraint if exists owner_commissions_fee_inr_check;
    alter table owner_commissions drop constraint if exists owner_commissions_fee_waived_check;
    if not exists (select 1 from pg_constraint where conname = 'owner_commissions_status_v2_check') then
      alter table owner_commissions add constraint owner_commissions_status_v2_check check (status in ('due', 'due_50', 'paid', 'refunded_50', 'waived', 'void'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'owner_commissions_fee_v2_check') then
      alter table owner_commissions add constraint owner_commissions_fee_v2_check check (fee_inr > 0 or (fee_inr = 0 and total_inr = 0 and status in ('waived', 'void')));
    end if;
    create unique index if not exists owner_commissions_deposit_mark_idx on owner_commissions (deposit_mark_id) where deposit_mark_id is not null;
  end if;
end $$;
