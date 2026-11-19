-- 0033: admin check on the owner's "deposit + rent advance received" mark (Rohith, 18 Nov 2026 10:02 AM IST).
-- The owner's mark alone triggers nothing; an admin verifies it (fee created, due 7 days after verification)
-- or rejects it with a reason. Additive and idempotent; safe to re-run. No existing row changes meaning:
-- marks made before this migration simply read as "waiting for the admin check".
-- Revert (only if ever needed):
--   alter table deposit_marks drop column if exists verified_at, drop column if exists verified_by,
--     drop column if exists rejected_at, drop column if exists rejected_by, drop column if exists reject_reason;
do $$
begin
  if to_regclass('public.deposit_marks') is not null then
    alter table deposit_marks add column if not exists verified_at timestamptz;
    alter table deposit_marks add column if not exists verified_by text;
    alter table deposit_marks add column if not exists rejected_at timestamptz;
    alter table deposit_marks add column if not exists rejected_by text;
    alter table deposit_marks add column if not exists reject_reason text not null default '';
  end if;
end $$;
