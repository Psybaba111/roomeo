-- Squad contact fee split into per-member shares, and short owner notes before payment. Additive.
alter table payments add column if not exists split_parts integer not null default 0;
alter table squad_requests add column if not exists notes_count integer not null default 0;
