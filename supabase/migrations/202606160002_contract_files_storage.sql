-- Migration: contract attachment storage metadata and Supabase Storage bucket.
-- Safe to run multiple times. It does not delete or truncate existing data.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-files',
  'contract-files',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.contract_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  storage_bucket text not null default 'contract-files',
  storage_path text not null,
  file_url text,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_contract_files_user_id on public.contract_files(user_id);
create index if not exists idx_contract_files_contract_id on public.contract_files(contract_id);
create unique index if not exists idx_contract_files_storage_path on public.contract_files(storage_path);

alter table public.contract_files enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contract_files' and policyname = 'contract_files_select_own'
  ) then
    create policy contract_files_select_own on public.contract_files
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contract_files' and policyname = 'contract_files_insert_own'
  ) then
    create policy contract_files_insert_own on public.contract_files
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contract_files' and policyname = 'contract_files_update_own'
  ) then
    create policy contract_files_update_own on public.contract_files
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contract_files' and policyname = 'contract_files_delete_own'
  ) then
    create policy contract_files_delete_own on public.contract_files
      for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contract_files_storage_select_own'
  ) then
    create policy contract_files_storage_select_own on storage.objects
      for select using (
        bucket_id = 'contract-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contract_files_storage_insert_own'
  ) then
    create policy contract_files_storage_insert_own on storage.objects
      for insert with check (
        bucket_id = 'contract-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contract_files_storage_update_own'
  ) then
    create policy contract_files_storage_update_own on storage.objects
      for update using (
        bucket_id = 'contract-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      ) with check (
        bucket_id = 'contract-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contract_files_storage_delete_own'
  ) then
    create policy contract_files_storage_delete_own on storage.objects
      for delete using (
        bucket_id = 'contract-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
