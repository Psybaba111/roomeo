-- Contact-fee refunds. Direct UPI has no gateway refunds, so the operator sends the
-- money back by hand: PAID -> REFUND_DUE (owner declined) -> REFUNDED (refund UTR recorded).
alter table payments add column if not exists payer_vpa text;
alter table payments add column if not exists refund_due_at timestamptz;
alter table payments add column if not exists refund_reason text;
alter table payments add column if not exists refund_utr text;
alter table payments add column if not exists refunded_by text;
alter table payments add column if not exists refunded_at timestamptz;
create index if not exists payments_refund_due_idx on payments (refund_due_at) where status = 'REFUND_DUE';
