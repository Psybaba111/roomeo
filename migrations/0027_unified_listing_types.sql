-- Unified Athiti + Roomeo listing types.
-- Additive only. Existing rows become pg_bed by default.
-- short_stay supports Athiti-style nightly homestays (meals, rides as add-ons later).

alter table listings
  add column if not exists listing_kind text not null default 'pg_bed'
    check (listing_kind in ('pg_bed', 'short_stay'));

-- Short-stay specific fields (nullable; only used when listing_kind = 'short_stay')
alter table listings
  add column if not exists nightly_rate integer check (nightly_rate is null or nightly_rate > 0),
  add column if not exists max_nights integer check (max_nights is null or max_nights between 1 and 365),
  add column if not exists check_in_time text,
  add column if not exists check_out_time text,
  add column if not exists meals_included boolean not null default false,
  add column if not exists meal_options text not null default '',
  add column if not exists experience_tags text not null default '';

-- Index for filtering by kind
create index if not exists listings_kind_idx on listings (listing_kind);

-- Comment for clarity
comment on column listings.listing_kind is 'pg_bed = Roomeo monthly bed; short_stay = Athiti nightly homestay';
