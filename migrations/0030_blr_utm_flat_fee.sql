-- Bengaluru launch Phase 0 (17 Nov 2026). Additive only, safe to re-run. Does NOT need 0027 or 0028 (each part is guarded).
-- 1) First-touch UTM on sign-ups, listings and waitlist sign-ups (nullable; the app skips saving if these are missing).
-- 2) Bengaluru launch areas for search (Koramangala and Whitefield are already in 0003).
-- 3) Owner fee becomes a flat ₹499 all-in: owner_commissions.rate_pct may be null for flat rows, fee_model says which.
--    Existing rows are untouched (they keep their % and amounts, fee_model 'percent').
-- Revert: alter table "user"/listings/waitlist_signups drop column if exists utm_source, utm_medium, utm_campaign;
--         delete from localities where id in ('00000000-0000-4000-8000-000000000b01','…b02','…b03');
--         alter table owner_commissions drop column if exists fee_model (only once no flat rows exist), then restore rate_pct not null.
alter table "user" add column if not exists utm_source text check (utm_source is null or length(utm_source) <= 100);
alter table "user" add column if not exists utm_medium text check (utm_medium is null or length(utm_medium) <= 100);
alter table "user" add column if not exists utm_campaign text check (utm_campaign is null or length(utm_campaign) <= 100);
alter table listings add column if not exists utm_source text check (utm_source is null or length(utm_source) <= 100);
alter table listings add column if not exists utm_medium text check (utm_medium is null or length(utm_medium) <= 100);
alter table listings add column if not exists utm_campaign text check (utm_campaign is null or length(utm_campaign) <= 100);
do $$
begin
  if to_regclass('public.waitlist_signups') is not null then
    alter table waitlist_signups add column if not exists utm_source text check (utm_source is null or length(utm_source) <= 100);
    alter table waitlist_signups add column if not exists utm_medium text check (utm_medium is null or length(utm_medium) <= 100);
    alter table waitlist_signups add column if not exists utm_campaign text check (utm_campaign is null or length(utm_campaign) <= 100);
  end if;
end $$;

insert into localities (id, city_id, name, lat, lng)
select v.id, c.id, v.name, v.lat, v.lng
from (values
  ('00000000-0000-4000-8000-000000000b01', 'HSR Layout', 12.9116, 77.6474),
  ('00000000-0000-4000-8000-000000000b02', 'Bellandur', 12.9260, 77.6760),
  ('00000000-0000-4000-8000-000000000b03', 'Electronic City', 12.8452, 77.6602)
) as v (id, name, lat, lng)
join cities c on c.name = 'Bengaluru'
where not exists (
  select 1 from localities l where l.city_id = c.id and lower(l.name) = lower(v.name)
)
on conflict (id) do nothing;

do $$
begin
  if to_regclass('public.owner_commissions') is not null then
    alter table owner_commissions add column if not exists fee_model text not null default 'percent' check (fee_model in ('percent', 'flat'));
    alter table owner_commissions alter column rate_pct drop not null;
  end if;
end $$;
