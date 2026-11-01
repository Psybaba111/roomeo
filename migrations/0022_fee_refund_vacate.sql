-- Fee refund on early move-out (Rohith, 1 Nov 2026): the ₹499 + GST fee is refunded only if the
-- renter vacates within 7 days of paying it. The operator records the move-out date here.
-- Revert: alter table deal_agreements drop column if exists vacated_on, drop column if exists vacate_recorded_by, drop column if exists vacate_recorded_at;
alter table deal_agreements add column if not exists vacated_on date;
alter table deal_agreements add column if not exists vacate_recorded_by text;
alter table deal_agreements add column if not exists vacate_recorded_at timestamptz;
