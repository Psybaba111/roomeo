-- Squad move ins: every active member and the owner confirm. Additive only.
create table if not exists squad_move_ins (
  id text primary key,
  squad_request_id text not null unique,
  squad_id text not null,
  listing_id text not null,
  owner_id text not null,
  owner_confirmed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists squad_move_in_confirms (
  squad_move_in_id text not null references squad_move_ins(id) on delete cascade,
  user_id text not null,
  confirmed_at timestamptz not null default now(),
  primary key (squad_move_in_id, user_id)
);

-- A squad contact paid with one member's free chat or personal pass records that member here.
alter table contact_unlocks add column if not exists charged_user_id text;
create index if not exists contact_unlocks_charged_idx on contact_unlocks (charged_user_id) where charged_user_id is not null;
