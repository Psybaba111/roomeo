-- ID verification attempts (DigiLocker Aadhaar / student ID) through a provider (mock locally; Setu/direct DigiLocker later).
-- Data minimised: verified name, document type, last 4 characters of the ID, provider reference. Never the full
-- Aadhaar number or document image. Additive only; nothing reads it unless ROOMEO_ID_VERIFICATION_ENABLED=true.
-- Revert: drop table if exists identity_verifications;
create table if not exists identity_verifications (
  id text primary key,
  user_id text not null,
  provider text not null,              -- mock | setu | digilocker
  doc_type text not null,              -- AADHAAR | STUDENT_ID
  status text not null default 'STARTED', -- STARTED | VERIFIED | FAILED
  verified_name text,
  id_last4 text,
  provider_ref text,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists identity_verifications_user_idx on identity_verifications (user_id, created_at desc);
