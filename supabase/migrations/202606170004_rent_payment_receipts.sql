-- Migration: manual rent coverage fields and rent payment receipt storage.
-- Safe to run multiple times. It does not delete or truncate existing data.

alter table public.rent_payments
  add column if not exists coverage_start_date date,
  add column if not exists coverage_end_date date,
  add column if not exists payment_status text not null default '已收';

update public.rent_payments
set
  coverage_start_date = coalesce(coverage_start_date, rent_month),
  coverage_end_date = coalesce(
    coverage_end_date,
    (date_trunc('month', rent_month)::date + interval '1 month - 1 day')::date
  ),
  payment_status = coalesce(nullif(payment_status, ''), case when amount_paid > 0 then '已收' else '未收' end)
where rent_month is not null;

create index if not exists idx_rent_payments_coverage_end
  on public.rent_payments(user_id, coverage_end_date);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rent-payment-files',
  'rent-payment-files',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.rent_payment_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rent_payment_id uuid not null references public.rent_payments(id) on delete cascade,
  storage_bucket text not null default 'rent-payment-files',
  storage_path text not null,
  file_url text,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_rent_payment_files_user_id on public.rent_payment_files(user_id);
create index if not exists idx_rent_payment_files_payment_id on public.rent_payment_files(rent_payment_id);
create unique index if not exists idx_rent_payment_files_storage_path on public.rent_payment_files(storage_path);

alter table public.rent_payment_files enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rent_payment_files' and policyname = 'rent_payment_files_select_own'
  ) then
    create policy rent_payment_files_select_own on public.rent_payment_files
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rent_payment_files' and policyname = 'rent_payment_files_insert_own'
  ) then
    create policy rent_payment_files_insert_own on public.rent_payment_files
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rent_payment_files' and policyname = 'rent_payment_files_delete_own'
  ) then
    create policy rent_payment_files_delete_own on public.rent_payment_files
      for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rent_payment_files_storage_select_own'
  ) then
    create policy rent_payment_files_storage_select_own on storage.objects
      for select using (
        bucket_id = 'rent-payment-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rent_payment_files_storage_insert_own'
  ) then
    create policy rent_payment_files_storage_insert_own on storage.objects
      for insert with check (
        bucket_id = 'rent-payment-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'rent_payment_files_storage_delete_own'
  ) then
    create policy rent_payment_files_storage_delete_own on storage.objects
      for delete using (
        bucket_id = 'rent-payment-files'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

comment on column public.rent_payments.amount_due is 'Reference monthly rent amount. Actual income and profit use amount_paid.';
comment on column public.rent_payments.amount_paid is 'Actual received amount. Used for income, profit, and partner settlement.';
comment on column public.rent_payments.coverage_start_date is 'Manual rent coverage start date.';
comment on column public.rent_payments.coverage_end_date is 'Manual rent coverage end date. Reminders use this date.';
comment on column public.rent_payments.payment_status is 'Manual payment status: 已收 or 未收.';
