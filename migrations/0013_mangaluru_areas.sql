-- Open Mangaluru for search: add its central areas. Additive only, safe to re-run.
insert into localities (id, city_id, name, lat, lng)
select v.id, c.id, v.name, v.lat, v.lng
from (values
  ('00000000-0000-4000-8000-000000000a01', 'Bunder', 12.8635, 74.8365),
  ('00000000-0000-4000-8000-000000000a02', 'Hampankatta', 12.8697, 74.8429),
  ('00000000-0000-4000-8000-000000000a03', 'Kodialbail', 12.8771, 74.8443),
  ('00000000-0000-4000-8000-000000000a04', 'Balmatta', 12.8706, 74.8545),
  ('00000000-0000-4000-8000-000000000a05', 'Kankanady', 12.8649, 74.8628),
  ('00000000-0000-4000-8000-000000000a06', 'Pandeshwar', 12.8586, 74.8411),
  ('00000000-0000-4000-8000-000000000a07', 'Surathkal', 13.0105, 74.7943)
) as v (id, name, lat, lng)
join cities c on c.name = 'Mangaluru'
where not exists (
  select 1 from localities l where l.city_id = c.id and lower(l.name) = lower(v.name)
)
on conflict (id) do nothing;
