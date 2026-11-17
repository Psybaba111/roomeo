-- Founding partners pay ₹0 on the owner side (17 Nov 2026). Lets owner_commissions hold a ₹0 'waived' row so admins
-- still see the founding move-in (nothing due, no payment link, no invoice). Existing rows are untouched.
-- Guarded: a no-op where 0027 (owner_commissions) isn't applied (prod today). Safe to re-run.
-- The app checks for the constraint owner_commissions_status_waived_check before writing a ₹0 row.
-- Revert (only once no 'waived' rows exist): drop the two *_waived_check constraints and re-add
--   check (fee_inr > 0) and check (status in ('due','due_50','paid','refunded_50')).
do $$
begin
  if to_regclass('public.owner_commissions') is not null then
    alter table owner_commissions drop constraint if exists owner_commissions_fee_inr_check;
    alter table owner_commissions drop constraint if exists owner_commissions_status_check;
    if not exists (select 1 from pg_constraint where conname = 'owner_commissions_fee_waived_check') then
      alter table owner_commissions add constraint owner_commissions_fee_waived_check check (fee_inr > 0 or (fee_inr = 0 and status = 'waived' and total_inr = 0 and amount_due_inr = 0));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'owner_commissions_status_waived_check') then
      alter table owner_commissions add constraint owner_commissions_status_waived_check check (status in ('due', 'due_50', 'paid', 'refunded_50', 'waived'));
    end if;
  end if;
end $$;
