-- Phase 2: account management, custom-login identity mapping, and session gates.
-- This migration is additive and only tightens existing policies with account/session checks.
-- It does not delete, rebuild, or modify any business rows.

begin;

do $$
declare
  expected_owner_id constant uuid := '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid;
  expected_owner_email constant text := '5350499@qq.com';
  owner_by_id_email text;
  owner_by_email_id uuid;
begin
  select lower(email) into owner_by_id_email
  from auth.users
  where id = expected_owner_id and deleted_at is null;

  select id into owner_by_email_id
  from auth.users
  where lower(email) = expected_owner_email and deleted_at is null;

  if owner_by_id_email is distinct from expected_owner_email
     or owner_by_email_id is distinct from expected_owner_id then
    raise exception 'Owner identity mismatch. Stage 2 was not applied.';
  end if;
end $$;

-- The table is intentionally in public for service-role PostgREST access, but no
-- authenticated browser role receives table privileges or an RLS policy.
create table if not exists public.account_auth_identities (
  auth_user_id uuid primary key references public.user_profiles(auth_user_id) on delete cascade,
  normalized_username text not null,
  auth_email text not null,
  is_internal_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(normalized_username) <> ''),
  check (btrim(auth_email) <> '')
);

create unique index if not exists idx_account_auth_identities_username_ci
  on public.account_auth_identities (lower(btrim(normalized_username)));
create unique index if not exists idx_account_auth_identities_email_ci
  on public.account_auth_identities (lower(btrim(auth_email)));

alter table public.account_auth_identities enable row level security;
revoke all on table public.account_auth_identities from anon, authenticated;
grant all on table public.account_auth_identities to service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'account_auth_identities_touch_updated_at'
      and tgrelid = 'public.account_auth_identities'::regclass
  ) then
    create trigger account_auth_identities_touch_updated_at
      before update on public.account_auth_identities
      for each row execute function app_private.touch_updated_at();
  end if;
end $$;

-- The fixed owner keeps the real email. Custom accounts receive an opaque
-- server-only email in this table and never expose it through account APIs.
insert into public.account_auth_identities (
  auth_user_id,
  normalized_username,
  auth_email,
  is_internal_email
)
values (
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid,
  '5350499@qq.com',
  '5350499@qq.com',
  false
)
on conflict (auth_user_id) do update
set
  normalized_username = excluded.normalized_username,
  auth_email = excluded.auth_email,
  is_internal_email = false,
  updated_at = now();

-- Owners with a legacy browser session remain compatible until they log in
-- through the Phase 2 route. Custom accounts must have an active app session.
-- A revoked session_id blocks refreshed access tokens from that session as well.
create or replace function app_private.is_app_session_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'active'
      and (
        p.sessions_revoked_at is null
        or (
          nullif((select auth.jwt() ->> 'iat'), '') is not null
          and to_timestamp(((select auth.jwt() ->> 'iat'))::double precision)
            > p.sessions_revoked_at
        )
      )
      and not exists (
        select 1
        from public.app_sessions revoked_session
        where revoked_session.session_id = (select auth.jwt() ->> 'session_id')
          and revoked_session.user_id = p.auth_user_id
          and revoked_session.status = 'revoked'
      )
      and (
        p.account_type = 'owner'
        or exists (
          select 1
          from public.app_sessions active_session
          where active_session.session_id = (select auth.jwt() ->> 'session_id')
            and active_session.user_id = p.auth_user_id
            and active_session.status = 'active'
        )
      )
  );
$$;

revoke all on function app_private.is_app_session_valid() from public;
grant execute on function app_private.is_app_session_valid() to authenticated;

-- Keep the existing policies in place, but require an active application
-- account and non-revoked session for every existing business-table path.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'properties', 'rooms', 'tenants', 'contracts', 'rent_payments', 'expenses',
    'deposits', 'tasks', 'tenant_notes'
  ] loop
    execute format(
      'alter policy %I on public.%I to authenticated using ((auth.uid() = user_id) and app_private.is_app_session_valid()) with check ((auth.uid() = user_id) and app_private.is_app_session_valid())',
      'Users can manage own rows', target_table
    );
  end loop;

  foreach target_table in array array[
    'properties', 'rooms', 'tenants', 'contracts', 'rent_payments', 'expenses',
    'deposits', 'tasks', 'tenant_notes', 'contract_files', 'rent_payment_files',
    'expense_files'
  ] loop
    execute format(
      'alter policy %I on public.%I to authenticated using (app_private.is_owner() and app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id()) with check (app_private.is_owner() and app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id())',
      'stage1_owner_compatibility', target_table
    );
  end loop;
end $$;

do $$
declare
  target_table text;
  policy_record record;
begin
  foreach target_table in array array['contract_files', 'rent_payment_files', 'expense_files'] loop
    for policy_record in
      select policyname, cmd
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname like target_table || '\_%\_own' escape '\'
    loop
      if policy_record.cmd = 'INSERT' then
        execute format(
          'alter policy %I on public.%I to authenticated with check ((auth.uid() = user_id) and app_private.is_app_session_valid())',
          policy_record.policyname, target_table
        );
      elsif policy_record.cmd = 'UPDATE' then
        execute format(
          'alter policy %I on public.%I to authenticated using ((auth.uid() = user_id) and app_private.is_app_session_valid()) with check ((auth.uid() = user_id) and app_private.is_app_session_valid())',
          policy_record.policyname, target_table
        );
      else
        execute format(
          'alter policy %I on public.%I to authenticated using ((auth.uid() = user_id) and app_private.is_app_session_valid())',
          policy_record.policyname, target_table
        );
      end if;
    end loop;
  end loop;
end $$;

-- Apply the same active-session gate to the account foundation reads.
alter policy user_profiles_select_self_or_owner on public.user_profiles
  to authenticated
  using (app_private.is_app_session_valid() and (auth_user_id = (select auth.uid()) or app_private.is_owner()));
alter policy user_permissions_select_self_or_owner on public.user_permissions
  to authenticated
  using (app_private.is_app_session_valid() and (user_id = (select auth.uid()) or app_private.is_owner()));
alter policy user_sensitive_permissions_select_self_or_owner on public.user_sensitive_permissions
  to authenticated
  using (app_private.is_app_session_valid() and (user_id = (select auth.uid()) or app_private.is_owner()));
alter policy user_property_access_select_self_or_owner on public.user_property_access
  to authenticated
  using (app_private.is_app_session_valid() and (user_id = (select auth.uid()) or app_private.is_owner()));
alter policy app_sessions_select_self_or_owner on public.app_sessions
  to authenticated
  using (app_private.is_app_session_valid() and (user_id = (select auth.uid()) or app_private.is_owner()));
alter policy audit_logs_select_authorized on public.audit_logs
  to authenticated
  using (app_private.is_app_session_valid() and app_private.has_sensitive_permission('view_audit_logs'));

-- Existing private business attachment buckets retain their owner-path rules;
-- only a valid active app session may use those paths.
do $$
declare
  bucket_name text;
  prefix text;
  policy_record record;
begin
  foreach bucket_name in array array['contract-files', 'rent-payment-files', 'expense-files'] loop
    prefix := replace(bucket_name, '-', '_') || '_storage_';
    for policy_record in
      select policyname, cmd
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname like prefix || '%'
    loop
      if policy_record.cmd = 'INSERT' then
        execute format(
          'alter policy %I on storage.objects to authenticated with check ((bucket_id = %L) and ((storage.foldername(name))[1] = (auth.uid())::text) and app_private.is_app_session_valid())',
          policy_record.policyname, bucket_name
        );
      elsif policy_record.cmd = 'UPDATE' then
        execute format(
          'alter policy %I on storage.objects to authenticated using ((bucket_id = %L) and ((storage.foldername(name))[1] = (auth.uid())::text) and app_private.is_app_session_valid()) with check ((bucket_id = %L) and ((storage.foldername(name))[1] = (auth.uid())::text) and app_private.is_app_session_valid())',
          policy_record.policyname, bucket_name, bucket_name
        );
      else
        execute format(
          'alter policy %I on storage.objects to authenticated using ((bucket_id = %L) and ((storage.foldername(name))[1] = (auth.uid())::text) and app_private.is_app_session_valid())',
          policy_record.policyname, bucket_name
        );
      end if;
    end loop;
  end loop;
end $$;

comment on table public.account_auth_identities is
  'Server-only custom login identifier to Supabase Auth email mapping. Browser roles have no access.';

commit;
