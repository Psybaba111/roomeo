-- GST invoice: snapshot buyer contact + optional buyer GSTIN + UTR on each invoice (1 Nov 2026).
-- Additive only. Code works before this runs (falls back to live profile/payment data, no GSTIN).
-- Revert: alter table fee_invoices drop column if exists buyer_email, drop column if exists buyer_phone, drop column if exists buyer_gstin, drop column if exists utr; alter table payments drop column if exists buyer_gstin;
alter table payments add column if not exists buyer_gstin text;
alter table fee_invoices add column if not exists buyer_email text;
alter table fee_invoices add column if not exists buyer_phone text;
alter table fee_invoices add column if not exists buyer_gstin text;
alter table fee_invoices add column if not exists utr text;
