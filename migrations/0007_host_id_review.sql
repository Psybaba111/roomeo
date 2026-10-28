-- Manual host ID review: a host submits ID details, an operator approves or rejects.
-- Approval sets the same identity fields DigiLocker does (identity_status = 'VERIFIED'),
-- with identity_source = 'STAFF' so it is never mistaken for a government check.
alter table profiles add column if not exists id_review_status text not null default '';
alter table profiles add column if not exists id_doc_type text not null default '';
alter table profiles add column if not exists id_doc_last4 text not null default '';
alter table profiles add column if not exists id_name text not null default '';
alter table profiles add column if not exists id_submitted_at timestamptz;
alter table profiles add column if not exists id_review_note text not null default '';
alter table profiles add column if not exists approved_by text;
alter table profiles add column if not exists approved_at timestamptz;
alter table profiles add column if not exists rejected_by text;
alter table profiles add column if not exists rejected_at timestamptz;
create index if not exists profiles_id_review_idx on profiles (id_review_status) where id_review_status = 'PENDING';
