-- Additive dual-provider metadata only. Existing Supabase Storage rows and objects are untouched.
begin;

alter table public.contract_files
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists provider_file_id text,
  alter column storage_path drop not null;

alter table public.rent_payment_files
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists provider_file_id text,
  alter column storage_path drop not null;

alter table public.expense_files
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists provider_file_id text,
  alter column storage_path drop not null;

alter table public.contract_files drop constraint if exists contract_files_storage_provider_check;
alter table public.rent_payment_files drop constraint if exists rent_payment_files_storage_provider_check;
alter table public.expense_files drop constraint if exists expense_files_storage_provider_check;

alter table public.contract_files add constraint contract_files_storage_provider_check check (storage_provider in ('supabase', 'google_drive'));
alter table public.rent_payment_files add constraint rent_payment_files_storage_provider_check check (storage_provider in ('supabase', 'google_drive'));
alter table public.expense_files add constraint expense_files_storage_provider_check check (storage_provider in ('supabase', 'google_drive'));

create unique index if not exists idx_contract_files_google_drive_file on public.contract_files(provider_file_id) where storage_provider = 'google_drive' and provider_file_id is not null;
create unique index if not exists idx_rent_payment_files_google_drive_file on public.rent_payment_files(provider_file_id) where storage_provider = 'google_drive' and provider_file_id is not null;
create unique index if not exists idx_expense_files_google_drive_file on public.expense_files(provider_file_id) where storage_provider = 'google_drive' and provider_file_id is not null;

comment on column public.contract_files.storage_provider is 'supabase for historical Storage attachments; google_drive for new Drive attachments.';
comment on column public.rent_payment_files.storage_provider is 'supabase for historical Storage attachments; google_drive for new Drive attachments.';
comment on column public.expense_files.storage_provider is 'supabase for historical Storage attachments; google_drive for new Drive attachments.';

commit;
