-- Additive property-level attachment storage. Existing attachment tables and
-- Storage objects are intentionally untouched.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-files', 'property-files', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.property_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_bucket text not null default 'property-files',
  storage_path text not null,
  file_url text,
  storage_provider text not null default 'supabase',
  provider_file_id text,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_property_files_user_id on public.property_files(user_id);
create index if not exists idx_property_files_property_id on public.property_files(property_id);
create unique index if not exists idx_property_files_storage_path on public.property_files(storage_path);

alter table public.property_files enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_files' and policyname = 'property_files_select_own') then
    create policy property_files_select_own on public.property_files for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_files' and policyname = 'property_files_insert_own') then
    create policy property_files_insert_own on public.property_files for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_files' and policyname = 'property_files_update_own') then
    create policy property_files_update_own on public.property_files for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_files' and policyname = 'property_files_delete_own') then
    create policy property_files_delete_own on public.property_files for delete using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'property_files_storage_select_own') then
    create policy property_files_storage_select_own on storage.objects for select using (bucket_id = 'property-files' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'property_files_storage_insert_own') then
    create policy property_files_storage_insert_own on storage.objects for insert with check (bucket_id = 'property-files' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'property_files_storage_update_own') then
    create policy property_files_storage_update_own on storage.objects for update using (bucket_id = 'property-files' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'property-files' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'property_files_storage_delete_own') then
    create policy property_files_storage_delete_own on storage.objects for delete using (bucket_id = 'property-files' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
