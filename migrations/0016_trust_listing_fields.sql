-- Trust-first listing fields (free model). Additive only, safe to re-run.
-- Revert: alter table listings drop column if exists all_in_inr, drop column if exists all_in_includes,
--         drop column if exists video_tour_url, drop column if exists deposit_refund_days;
--         alter table listing_images drop column if exists uploaded_at;
alter table listings add column if not exists all_in_inr integer;
alter table listings add column if not exists all_in_includes text not null default '';
alter table listings add column if not exists video_tour_url text not null default '';
alter table listings add column if not exists deposit_refund_days integer not null default 7;
-- Existing photos keep a null date (unknown), new uploads get stamped.
alter table listing_images add column if not exists uploaded_at timestamptz;
alter table listing_images alter column uploaded_at set default now();
