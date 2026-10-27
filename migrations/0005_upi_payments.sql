-- Zero-commission UPI payments: direct UPI deep link + QR, manual UTR review.
alter table payments add column if not exists ref text;
alter table payments add column if not exists plan_id text;
alter table payments add column if not exists utr text;
alter table payments add column if not exists submitted_at timestamptz;
alter table payments add column if not exists reviewed_by text;
alter table payments add column if not exists reviewed_at timestamptz;
alter table subscriptions add column if not exists payment_id text;
alter table subscriptions add column if not exists activated_at timestamptz;

-- Old Razorpay prototype left NOT_CONFIGURED junk rows; they never took money.
delete from payments where status = 'NOT_CONFIGURED' and provider = 'RAZORPAY';
delete from subscriptions where status = 'NONE' and payment_id is null;

create unique index if not exists payments_ref_key on payments (ref) where ref is not null;
create unique index if not exists payments_utr_key on payments (utr) where utr is not null;
-- One open UPI checkout per user and plan: startCheckout is idempotent.
create unique index if not exists payments_open_upi_key on payments (user_id, plan_id)
  where provider = 'UPI' and status in ('PENDING', 'SUBMITTED');

create table if not exists payment_utr_attempts (
  id text primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_utr_attempts_user_idx on payment_utr_attempts (user_id, created_at);
