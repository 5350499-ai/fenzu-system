-- Phase 1: additive account and permission foundation.
-- This migration does not alter or delete existing business rows or policies.

begin;

-- Abort before any DDL if the fixed owner email and Auth user id do not match.
do $$
declare
  expected_owner_id constant uuid := '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid;
  expected_owner_email constant text := '5350499@qq.com';
  owner_by_id_email text;
  owner_by_email_id uuid;
begin
  select lower(email)
    into owner_by_id_email
  from auth.users
  where id = expected_owner_id
    and deleted_at is null;

  select id
    into owner_by_email_id
  from auth.users
  where lower(email) = expected_owner_email
    and deleted_at is null;

  if owner_by_id_email is distinct from expected_owner_email
     or owner_by_email_id is distinct from expected_owner_id then
    raise exception
      'Owner identity mismatch. Expected email % and Auth user id %, got email % and id %.',
      expected_owner_email,
      expected_owner_id,
      owner_by_id_email,
      owner_by_email_id;
  end if;
end $$;

create schema if not exists app_private;
revoke all on schema app_private from public;

create table if not exists public.user_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  username text not null,
  display_name text not null,
  account_type text not null check (account_type in ('owner', 'custom')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  property_access_mode text not null default 'selected'
    check (property_access_mode in ('all', 'selected')),
  must_change_password boolean not null default false,
  sessions_revoked_at timestamptz,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (btrim(username) <> ''),
  check (btrim(display_name) <> '')
);

create unique index if not exists idx_user_profiles_username_ci
  on public.user_profiles (lower(btrim(username)));
create index if not exists idx_user_profiles_workspace_owner
  on public.user_profiles (workspace_owner_id);
create index if not exists idx_user_profiles_status
  on public.user_profiles (workspace_owner_id, status);
create index if not exists idx_user_profiles_created_by
  on public.user_profiles (created_by);
create index if not exists idx_user_profiles_updated_by
  on public.user_profiles (updated_by);
create index if not exists idx_user_profiles_disabled_by
  on public.user_profiles (disabled_by);

create table if not exists public.user_permissions (
  user_id uuid not null references public.user_profiles(auth_user_id) on delete cascade,
  module_key text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_archive boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key),
  check (can_view or not (can_create or can_edit or can_archive or can_delete))
);

create table if not exists public.user_sensitive_permissions (
  user_id uuid primary key references public.user_profiles(auth_user_id) on delete cascade,
  can_view_tenant_phone boolean not null default false,
  can_view_tenant_wechat boolean not null default false,
  can_view_tenant_id_number boolean not null default false,
  can_view_tenant_notes boolean not null default false,
  can_view_contract_files boolean not null default false,
  can_view_rent_files boolean not null default false,
  can_view_expense_files boolean not null default false,
  can_download_files boolean not null default false,
  can_upload_files boolean not null default false,
  can_replace_files boolean not null default false,
  can_delete_files boolean not null default false,
  can_export_data boolean not null default false,
  can_view_profits boolean not null default false,
  can_view_partnership_settlement boolean not null default false,
  can_view_audit_logs boolean not null default false,
  can_manage_accounts boolean not null default false,
  can_manage_settings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_property_access (
  user_id uuid not null references public.user_profiles(auth_user_id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (user_id, property_id)
);

create index if not exists idx_user_property_access_property
  on public.user_property_access (property_id, user_id);
create index if not exists idx_user_property_access_created_by
  on public.user_property_access (created_by);

-- A session row never stores refresh tokens. It records only the JWT session_id.
create table if not exists public.app_sessions (
  session_id text primary key,
  user_id uuid not null references public.user_profiles(auth_user_id) on delete cascade,
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  ip_address inet,
  user_agent text
);

create index if not exists idx_app_sessions_user_status
  on public.app_sessions (user_id, status);
create index if not exists idx_app_sessions_workspace_owner
  on public.app_sessions (workspace_owner_id);
create index if not exists idx_app_sessions_revoked_by
  on public.app_sessions (revoked_by);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  log_category text not null default 'business'
    check (log_category in ('business', 'security')),
  actor_user_id uuid,
  actor_username text,
  actor_display_name text,
  session_id text,
  action_type text not null,
  module_key text not null,
  entity_type text,
  entity_id uuid,
  property_id uuid,
  room_id uuid,
  tenant_id uuid,
  before_data jsonb,
  after_data jsonb,
  amount numeric,
  description text,
  success boolean not null default true,
  request_id uuid,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_actor
  on public.audit_logs (actor_user_id, created_at desc);
create index if not exists idx_audit_logs_property
  on public.audit_logs (property_id, created_at desc);
create index if not exists idx_audit_logs_module_action
  on public.audit_logs (module_key, action_type, created_at desc);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.protect_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.account_type = 'owner' then
    raise exception 'The owner account cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    if old.account_type = 'owner' and (
      new.auth_user_id is distinct from old.auth_user_id
      or new.workspace_owner_id is distinct from old.auth_user_id
      or new.account_type <> 'owner'
      or new.status <> 'active'
    ) then
      raise exception 'The owner account cannot be disabled or demoted.';
    end if;

    if old.account_type <> 'owner' and new.account_type = 'owner' then
      raise exception 'A custom account cannot be promoted to owner.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function app_private.prevent_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Audit logs are append-only and cannot be changed or deleted.';
end;
$$;

create or replace function app_private.is_active_account()
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
  );
$$;

create or replace function app_private.is_owner()
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
      and p.account_type = 'owner'
      and p.status = 'active'
  );
$$;

create or replace function app_private.current_workspace_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.workspace_owner_id
  from public.user_profiles p
  where p.auth_user_id = (select auth.uid())
    and p.status = 'active'
  limit 1;
$$;

create or replace function app_private.has_module_permission(
  requested_module text,
  requested_action text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_owner() or exists (
    select 1
    from public.user_profiles p
    join public.user_permissions permission
      on permission.user_id = p.auth_user_id
    where p.auth_user_id = (select auth.uid())
      and p.status = 'active'
      and p.account_type = 'custom'
      and permission.module_key = requested_module
      and case requested_action
        when 'view' then permission.can_view
        when 'create' then permission.can_create
        when 'edit' then permission.can_edit
        when 'archive' then permission.can_archive
        when 'delete' then permission.can_delete
        else false
      end
  );
$$;

create or replace function app_private.has_sensitive_permission(
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_owner() or exists (
    select 1
    from public.user_profiles p
    join public.user_sensitive_permissions permission
      on permission.user_id = p.auth_user_id
    where p.auth_user_id = (select auth.uid())
      and p.status = 'active'
      and p.account_type = 'custom'
      and case requested_permission
        when 'view_tenant_phone' then permission.can_view_tenant_phone
        when 'view_tenant_wechat' then permission.can_view_tenant_wechat
        when 'view_tenant_id_number' then permission.can_view_tenant_id_number
        when 'view_tenant_notes' then permission.can_view_tenant_notes
        when 'view_contract_files' then permission.can_view_contract_files
        when 'view_rent_files' then permission.can_view_rent_files
        when 'view_expense_files' then permission.can_view_expense_files
        when 'download_files' then permission.can_download_files
        when 'upload_files' then permission.can_upload_files
        when 'replace_files' then permission.can_replace_files
        when 'delete_files' then permission.can_delete_files
        when 'export_data' then permission.can_export_data
        when 'view_profits' then permission.can_view_profits
        when 'view_partnership_settlement' then permission.can_view_partnership_settlement
        when 'view_audit_logs' then permission.can_view_audit_logs
        when 'manage_accounts' then permission.can_manage_accounts
        when 'manage_settings' then permission.can_manage_settings
        else false
      end
  );
$$;

create or replace function app_private.can_access_property(
  requested_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_owner() or exists (
    select 1
    from public.user_profiles p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'active'
      and p.account_type = 'custom'
      and (
        p.property_access_mode = 'all'
        or exists (
          select 1
          from public.user_property_access access
          where access.user_id = p.auth_user_id
            and access.property_id = requested_property_id
        )
      )
  );
$$;

-- This function is prepared for Phase 2. Phase 1 does not yet add it to the
-- existing business policies, so the current login and RLS behavior stay intact.
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
        from public.app_sessions session
        where session.session_id = (select auth.jwt() ->> 'session_id')
          and session.user_id = p.auth_user_id
          and session.status = 'revoked'
      )
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_profiles_touch_updated_at'
      and tgrelid = 'public.user_profiles'::regclass
  ) then
    create trigger user_profiles_touch_updated_at
      before update on public.user_profiles
      for each row execute function app_private.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_permissions_touch_updated_at'
      and tgrelid = 'public.user_permissions'::regclass
  ) then
    create trigger user_permissions_touch_updated_at
      before update on public.user_permissions
      for each row execute function app_private.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_sensitive_permissions_touch_updated_at'
      and tgrelid = 'public.user_sensitive_permissions'::regclass
  ) then
    create trigger user_sensitive_permissions_touch_updated_at
      before update on public.user_sensitive_permissions
      for each row execute function app_private.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_profiles_protect_owner'
      and tgrelid = 'public.user_profiles'::regclass
  ) then
    create trigger user_profiles_protect_owner
      before update or delete on public.user_profiles
      for each row execute function app_private.protect_owner_profile();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_logs_append_only'
      and tgrelid = 'public.audit_logs'::regclass
  ) then
    create trigger audit_logs_append_only
      before update or delete on public.audit_logs
      for each row execute function app_private.prevent_audit_log_mutation();
  end if;
end $$;

-- Seed the fixed current account as the only owner. No Auth password changes.
insert into public.user_profiles (
  auth_user_id,
  workspace_owner_id,
  username,
  display_name,
  account_type,
  status,
  property_access_mode,
  must_change_password,
  created_by,
  updated_by
)
values (
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid,
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid,
  '5350499@qq.com',
  U&'\4E3B\7BA1\7406\5458',
  'owner',
  'active',
  'all',
  false,
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid,
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid
)
on conflict (auth_user_id) do update
set
  workspace_owner_id = excluded.workspace_owner_id,
  username = excluded.username,
  account_type = 'owner',
  status = 'active',
  property_access_mode = 'all',
  must_change_password = false,
  disabled_at = null,
  disabled_by = null,
  updated_at = now(),
  updated_by = excluded.updated_by;

insert into public.user_permissions (
  user_id,
  module_key,
  can_view,
  can_create,
  can_edit,
  can_archive,
  can_delete
)
select
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid,
  module_key,
  true,
  true,
  true,
  true,
  true
from unnest(array[
  'home',
  'properties',
  'rooms',
  'tenants',
  'rent_payments',
  'expenses',
  'reminders',
  'analytics',
  'profits',
  'partnership_settlement',
  'attachments',
  'audit_logs',
  'settings',
  'accounts'
]) as module_key
on conflict (user_id, module_key) do update
set
  can_view = true,
  can_create = true,
  can_edit = true,
  can_archive = true,
  can_delete = true,
  updated_at = now();

insert into public.user_sensitive_permissions (
  user_id,
  can_view_tenant_phone,
  can_view_tenant_wechat,
  can_view_tenant_id_number,
  can_view_tenant_notes,
  can_view_contract_files,
  can_view_rent_files,
  can_view_expense_files,
  can_download_files,
  can_upload_files,
  can_replace_files,
  can_delete_files,
  can_export_data,
  can_view_profits,
  can_view_partnership_settlement,
  can_view_audit_logs,
  can_manage_accounts,
  can_manage_settings
)
values (
  '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid,
  true, true, true, true, true, true, true, true, true,
  true, true, true, true, true, true, true, true
)
on conflict (user_id) do update
set
  can_view_tenant_phone = true,
  can_view_tenant_wechat = true,
  can_view_tenant_id_number = true,
  can_view_tenant_notes = true,
  can_view_contract_files = true,
  can_view_rent_files = true,
  can_view_expense_files = true,
  can_download_files = true,
  can_upload_files = true,
  can_replace_files = true,
  can_delete_files = true,
  can_export_data = true,
  can_view_profits = true,
  can_view_partnership_settlement = true,
  can_view_audit_logs = true,
  can_manage_accounts = true,
  can_manage_settings = true,
  updated_at = now();

alter table public.user_profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.user_sensitive_permissions enable row level security;
alter table public.user_property_access enable row level security;
alter table public.app_sessions enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.user_permissions from anon, authenticated;
revoke all on table public.user_sensitive_permissions from anon, authenticated;
revoke all on table public.user_property_access from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select on table public.user_profiles to authenticated;
grant select on table public.user_permissions to authenticated;
grant select on table public.user_sensitive_permissions to authenticated;
grant select on table public.user_property_access to authenticated;
grant select on table public.app_sessions to authenticated;
grant select on table public.audit_logs to authenticated;

grant usage on schema app_private to authenticated;

revoke all on function app_private.touch_updated_at() from public;
revoke all on function app_private.protect_owner_profile() from public;
revoke all on function app_private.prevent_audit_log_mutation() from public;
revoke all on function app_private.is_active_account() from public;
revoke all on function app_private.is_owner() from public;
revoke all on function app_private.current_workspace_owner_id() from public;
revoke all on function app_private.has_module_permission(text, text) from public;
revoke all on function app_private.has_sensitive_permission(text) from public;
revoke all on function app_private.can_access_property(uuid) from public;
revoke all on function app_private.is_app_session_valid() from public;

grant execute on function app_private.is_active_account() to authenticated;
grant execute on function app_private.is_owner() to authenticated;
grant execute on function app_private.current_workspace_owner_id() to authenticated;
grant execute on function app_private.has_module_permission(text, text) to authenticated;
grant execute on function app_private.has_sensitive_permission(text) to authenticated;
grant execute on function app_private.can_access_property(uuid) to authenticated;
grant execute on function app_private.is_app_session_valid() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_select_self_or_owner'
  ) then
    create policy user_profiles_select_self_or_owner
      on public.user_profiles
      for select to authenticated
      using (auth_user_id = (select auth.uid()) or app_private.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_permissions'
      and policyname = 'user_permissions_select_self_or_owner'
  ) then
    create policy user_permissions_select_self_or_owner
      on public.user_permissions
      for select to authenticated
      using (user_id = (select auth.uid()) or app_private.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_sensitive_permissions'
      and policyname = 'user_sensitive_permissions_select_self_or_owner'
  ) then
    create policy user_sensitive_permissions_select_self_or_owner
      on public.user_sensitive_permissions
      for select to authenticated
      using (user_id = (select auth.uid()) or app_private.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_property_access'
      and policyname = 'user_property_access_select_self_or_owner'
  ) then
    create policy user_property_access_select_self_or_owner
      on public.user_property_access
      for select to authenticated
      using (user_id = (select auth.uid()) or app_private.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_sessions'
      and policyname = 'app_sessions_select_self_or_owner'
  ) then
    create policy app_sessions_select_self_or_owner
      on public.app_sessions
      for select to authenticated
      using (user_id = (select auth.uid()) or app_private.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_select_authorized'
  ) then
    create policy audit_logs_select_authorized
      on public.audit_logs
      for select to authenticated
      using (app_private.has_sensitive_permission('view_audit_logs'));
  end if;
end $$;

-- Add a second permissive owner path. Existing auth.uid() = user_id policies
-- remain untouched and continue to protect the current application.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'properties',
    'rooms',
    'tenants',
    'contracts',
    'rent_payments',
    'expenses',
    'deposits',
    'tasks',
    'tenant_notes',
    'contract_files',
    'rent_payment_files',
    'expense_files'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'stage1_owner_compatibility'
    ) then
      execute format(
        'create policy stage1_owner_compatibility on public.%I for all to authenticated using (app_private.is_owner() and user_id = app_private.current_workspace_owner_id()) with check (app_private.is_owner() and user_id = app_private.current_workspace_owner_id())',
        table_name
      );
    end if;
  end loop;
end $$;

comment on table public.user_profiles is
  'Application account profile. account_type is owner or custom.';
comment on table public.user_permissions is
  'Module-by-operation permission matrix for application accounts.';
comment on table public.user_sensitive_permissions is
  'Sensitive-field and privileged-operation permissions.';
comment on table public.user_property_access is
  'Explicit property access for custom accounts in selected mode.';
comment on table public.app_sessions is
  'Application session revocation records keyed by Supabase JWT session_id. No refresh tokens are stored.';
comment on table public.audit_logs is
  'Append-only business and security audit log. Actor identity is supplied by verified server context.';

commit;
