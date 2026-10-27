-- RoomSetu marketplace schema. Identity lives in "user" (Better Auth).
-- App user ids are text so they match Better Auth. Demo profiles use text ids
-- and are flagged is_demo = true.

create table if not exists cities (
  id text primary key,
  name text not null unique,
  state text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists localities (
  id text primary key,
  city_id text not null references cities (id),
  name text not null,
  lat double precision,
  lng double precision,
  unique (city_id, name)
);

create table if not exists amenities (
  id text primary key,
  name text not null unique,
  group_name text not null
);

create table if not exists permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

create table if not exists profiles (
  user_id text primary key,
  full_name text not null,
  mobile text,
  age integer,
  gender text,
  city text,
  occupation text,
  intent text not null default 'LOOKING',
  preferred_cities text not null default '',
  about text not null default '',
  lifestyle text not null default '',
  smoking text not null default 'NO',
  pets text not null default 'NO',
  food text not null default 'ANY',
  budget integer,
  move_in date,
  room_pref text,
  furnished_pref text,
  show_age boolean not null default true,
  show_occupation boolean not null default true,
  show_city boolean not null default true,
  allow_messages text not null default 'EVERYONE',
  account_status text not null default 'ACTIVE',
  verification_status text not null default 'UNVERIFIED',
  reputation integer not null default 0,
  is_demo boolean not null default false,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profile_roles (
  user_id text not null references profiles (user_id) on delete cascade,
  role text not null,
  primary key (user_id, role)
);

create table if not exists properties (
  id text primary key,
  owner_id text not null references profiles (user_id),
  title text not null,
  property_type text not null,
  address text not null,
  city_id text not null references cities (id),
  locality_id text references localities (id),
  pincode text not null,
  lat double precision not null,
  lng double precision not null,
  verification_status text not null default 'UNVERIFIED',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists listings (
  id text primary key,
  property_id text not null references properties (id),
  owner_id text not null references profiles (user_id),
  title text not null,
  description text not null,
  city_name text not null,
  locality_name text not null,
  monthly_rent integer not null,
  deposit integer not null,
  available_from date not null,
  min_stay_months integer not null default 1,
  max_stay_months integer,
  room_type text not null,
  furnished text not null,
  attached_bath boolean not null default false,
  balcony boolean not null default false,
  ac boolean not null default false,
  wifi boolean not null default true,
  kitchen boolean not null default true,
  washing_machine boolean not null default false,
  parking boolean not null default false,
  power_backup boolean not null default false,
  lift boolean not null default false,
  housekeeping boolean not null default false,
  food_available boolean not null default false,
  smoking_allowed boolean not null default false,
  pets_allowed boolean not null default false,
  guest_policy text not null default 'Occasional guests with a day''s notice',
  gender_pref text not null default 'ANY',
  age_pref text not null default 'Any age 18+',
  occupation_pref text not null default 'ANY',
  roommate_pref text not null default '',
  occupants integer not null default 0,
  status text not null default 'ACTIVE',
  verification_status text not null default 'UNVERIFIED',
  listing_tier text not null default 'FREE',
  quality_score integer not null default 70,
  views integer not null default 0,
  fingerprint text not null default '',
  possible_duplicate boolean not null default false,
  auto_reply text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_city_idx on listings (city_name);
create index if not exists listings_locality_idx on listings (locality_name);
create index if not exists listings_owner_idx on listings (owner_id);
create index if not exists listings_status_idx on listings (status);
create index if not exists listings_rent_idx on listings (monthly_rent);
create index if not exists listings_available_idx on listings (available_from);
create index if not exists listings_room_type_idx on listings (room_type);
create index if not exists listings_fingerprint_idx on listings (fingerprint);

create table if not exists listing_images (
  id text primary key,
  listing_id text not null references listings (id) on delete cascade,
  url text not null,
  category text not null,
  sort_order integer not null default 0
);

create table if not exists listing_amenities (
  listing_id text not null references listings (id) on delete cascade,
  amenity_id text not null references amenities (id),
  primary key (listing_id, amenity_id)
);

create table if not exists room_wanted (
  id text primary key,
  user_id text not null references profiles (user_id),
  display_name text not null,
  age integer,
  gender text,
  occupation text,
  city text not null,
  localities text not null default '',
  budget integer not null,
  move_in date,
  duration_months integer,
  room_pref text not null,
  furnished_pref text not null,
  food_pref text not null,
  smoking_pref text not null,
  pet_pref text not null,
  roommate_gender text not null default 'ANY',
  people_count integer not null default 1,
  bio text not null,
  lifestyle text not null default '',
  status text not null default 'ACTIVE',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists room_wanted_city_idx on room_wanted (city);
create index if not exists room_wanted_user_idx on room_wanted (user_id);
create index if not exists room_wanted_status_idx on room_wanted (status);

create table if not exists conversations (
  id text primary key,
  listing_id text references listings (id),
  room_wanted_id text references room_wanted (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id text not null references conversations (id) on delete cascade,
  user_id text not null,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on conversation_members (user_id);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations (id) on delete cascade,
  sender_id text not null,
  body text not null,
  kind text not null default 'USER',
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

create table if not exists blocks (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists saved_listings (
  user_id text not null references profiles (user_id) on delete cascade,
  listing_id text not null references listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists applications (
  id text primary key,
  listing_id text not null references listings (id),
  seeker_id text not null references profiles (user_id),
  host_id text not null references profiles (user_id),
  note text not null default '',
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_seeker_idx on applications (seeker_id);
create index if not exists applications_host_idx on applications (host_id);
create index if not exists applications_listing_idx on applications (listing_id);

create table if not exists matches (
  id text primary key,
  user_id text not null,
  listing_id text references listings (id),
  room_wanted_id text references room_wanted (id),
  score integer not null,
  reasons text not null,
  created_at timestamptz not null default now()
);

create index if not exists matches_user_idx on matches (user_id);

create table if not exists notifications (
  id text primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  body text not null,
  href text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at);

create table if not exists reports (
  id text primary key,
  reporter_id text not null,
  target_type text not null,
  target_id text not null,
  category text not null,
  note text not null default '',
  status text not null default 'OPEN',
  fraud_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_status_idx on reports (status);

create table if not exists trust_checks (
  id text primary key,
  user_id text not null,
  property_id text,
  kind text not null,
  status text not null default 'PENDING',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trust_checks_user_idx on trust_checks (user_id);

create table if not exists reviews (
  id text primary key,
  author_id text not null,
  subject_id text not null,
  listing_id text,
  rating integer not null,
  body text not null,
  status text not null default 'COMING_SOON',
  created_at timestamptz not null default now()
);

create table if not exists subscription_plans (
  id text primary key,
  code text not null unique,
  name text not null,
  audience text not null,
  price_inr integer not null,
  interval_months integer not null default 1,
  perks text not null,
  active boolean not null default true
);

create table if not exists subscriptions (
  id text primary key,
  user_id text not null,
  plan_id text not null references subscription_plans (id),
  status text not null default 'NONE',
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id text primary key,
  user_id text not null,
  purpose text not null,
  amount_inr integer not null,
  status text not null,
  provider text not null default 'RAZORPAY',
  provider_ref text,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id text primary key,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log (created_at);

create table if not exists search_history (
  id text primary key,
  user_id text not null,
  query text not null,
  created_at timestamptz not null default now()
);

create table if not exists dashboard_layouts (
  user_id text primary key,
  layout text not null,
  updated_at timestamptz not null default now()
);

create table if not exists metric_events (
  id text primary key,
  kind text not null,
  city text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists metric_events_kind_idx on metric_events (kind, created_at);

create index if not exists properties_city_idx on properties (city_id);
create index if not exists localities_city_idx on localities (city_id);
