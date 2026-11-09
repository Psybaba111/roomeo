-- Mud Home Premium PG (MPT Road, Bunder) listing titles: retarget to working men, drop "with meals"
-- (food is optional, +₹3,500/mo). Updates ONLY listings.title for exactly these 4 ids, and only while
-- the title is still the old value, so it is a no-op if someone already fixed it by hand.
-- Never touches description ("About the room" was already edited) or any other column.
--
-- MANUAL, NOT AUTO-APPLIED: this file lives in migrations/manual/, which neither scripts/migrate.mjs
-- (non-recursive readdir of migrations/) nor the PGLite fallback (glob /migrations/*.sql) picks up.
-- Run it by hand once, after Rohith approves, inside a transaction:
--   begin; \i migrations/manual/0027_mud_home_titles.sql  -- expect "UPDATE 1" x4
--   select id, title from listings where id in (...4 ids below...); commit;
-- Preview first (read-only):
--   select id, title from listings where id in ('76075a48-597e-4ac0-818f-682ff0401fc7','d5e6e518-516a-444b-a555-372e859159b0','b9e6c158-2a1e-4784-b42e-b541e2f660db','e139bd64-4794-435b-a0d4-9096075e1974');
-- Revert (only if needed): swap the two literals in each statement.

update listings set title = 'Mud Home Premium PG · 6-sharing AC bed for working men · MPT Road, Bunder'
 where id = '76075a48-597e-4ac0-818f-682ff0401fc7' and title = 'Mud Home Premium PG · AC 6-sharing single bed with meals';

update listings set title = 'Mud Home Premium PG · 4-sharing AC bed for working men · MPT Road, Bunder'
 where id = 'd5e6e518-516a-444b-a555-372e859159b0' and title = 'Mud Home Premium PG · AC 4-sharing single bed with meals';

update listings set title = 'Mud Home Premium PG · 3-sharing AC bed for working men · MPT Road, Bunder'
 where id = 'b9e6c158-2a1e-4784-b42e-b541e2f660db' and title = 'Mud Home Premium PG · AC 3-sharing single bed with meals';

update listings set title = 'Mud Home Premium PG · 2-sharing AC bed for working men · MPT Road, Bunder'
 where id = 'e139bd64-4794-435b-a0d4-9096075e1974' and title = 'Mud Home Premium PG · AC 2-sharing single bed with meals';
