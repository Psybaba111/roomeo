-- GST tax invoice for the ₹99 trial nights service fee (2 Nov 2026). Additive only.
-- Trial invoices live in fee_invoices with kind = 'TRIAL_FEE' and their own series RMT/<FY>/000001 (trial_invoice_seq),
-- so they never clash with RMO/<FY>/… success-fee invoices (fee_invoice_seq).
-- Revert: alter table fee_invoices drop column if exists kind, drop column if exists trial_booking_id; drop sequence if exists trial_invoice_seq;
create sequence if not exists trial_invoice_seq start 1;
alter table fee_invoices add column if not exists kind text not null default 'SUCCESS_FEE';
alter table fee_invoices add column if not exists trial_booking_id text;
