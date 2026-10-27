-- Phone OTP, unique trust checks, and a shared Postgres rate-limit table.
alter table profiles add column if not exists phone_e164 text;
alter table profiles add column if not exists phone_verified_at timestamptz;

create table if not exists phone_otps (
  user_id text primary key,
  phone_e164 text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Keep the newest check per (user_id, kind), then enforce uniqueness so writes can upsert.
delete from trust_checks t using trust_checks n
  where t.user_id = n.user_id and t.kind = n.kind
    and (t.updated_at, t.id) < (n.updated_at, n.id);
create unique index if not exists trust_checks_user_kind_key on trust_checks (user_id, kind);

-- Self-attested PENDING checks from the old one-click flow mean nothing; drop them.
delete from trust_checks where status = 'PENDING' and note like 'Submitted in the app.%';
update profiles set verification_status = 'UNVERIFIED' where verification_status = 'PENDING';

-- Generalise the UTR attempts table from 0005 into the per-user rate-limit log.
alter table payment_utr_attempts add column if not exists bucket text not null default 'utr';
create index if not exists payment_utr_attempts_bucket_idx on payment_utr_attempts (user_id, bucket, created_at);
create unique index if not exists profiles_verified_phone_key on profiles (phone_e164) where phone_verified_at is not null;
