-- Squad deal agreements (every member + owner sign) and GST invoices for success fees. Additive only.
-- Revert: drop table if exists fee_invoices; drop sequence if exists fee_invoice_seq; drop table if exists deal_agreement_signers;
--         drop index if exists deal_agreements_squad_req_idx; alter table deal_agreements drop column if exists squad_request_id;
alter table deal_agreements add column if not exists squad_request_id text;
create unique index if not exists deal_agreements_squad_req_idx on deal_agreements (squad_request_id) where squad_request_id is not null;

create table if not exists deal_agreement_signers (
  agreement_id text not null references deal_agreements (id) on delete cascade,
  user_id text not null,
  role text not null,               -- TENANT | OWNER
  name text not null,
  ip text not null default '',
  signed_at timestamptz not null default now(),
  primary key (agreement_id, user_id)
);

create sequence if not exists fee_invoice_seq start 1;
create table if not exists fee_invoices (
  id text primary key,
  number text not null unique,
  payment_id text not null unique,
  user_id text not null,
  agreement_id text,
  issued_at timestamptz not null default now(),
  buyer_name text not null,
  buyer_state text,                 -- null = not known
  place_of_supply text not null,
  taxable_paise integer not null,
  cgst_paise integer not null default 0,
  sgst_paise integer not null default 0,
  igst_paise integer not null default 0,
  total_paise integer not null,
  round_off_paise integer not null default 0,
  paid_inr integer not null
);
create index if not exists fee_invoices_user_idx on fee_invoices (user_id);
