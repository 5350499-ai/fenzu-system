-- Free single-account V1: explicit plan marker plus an RLS-level attachment
-- boundary. Existing managed accounts and all business rows remain unchanged.
begin;

alter table public.user_profiles
  add column if not exists account_plan text not null default 'managed';

alter table public.user_profiles
  drop constraint if exists user_profiles_account_plan_check;

alter table public.user_profiles
  add constraint user_profiles_account_plan_check
  check (account_plan in ('managed', 'free_single'));

create or replace function app_private.is_free_single_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.status = 'active'
      and profile.account_type = 'custom'
      and profile.account_plan = 'free_single'
  );
$$;

-- The stage-3 policies call these helpers. The extra guard makes the plan a
-- server-enforced capability rather than a client-side convention.
create or replace function app_private.has_module_permission(requested_module text, requested_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_owner() or exists (
    select 1
    from public.user_profiles profile
    join public.user_permissions permission on permission.user_id = profile.auth_user_id
    where profile.auth_user_id = (select auth.uid())
      and profile.status = 'active'
      and profile.account_type = 'custom'
      and not (profile.account_plan = 'free_single' and requested_module in ('attachments', 'partnership_settlement', 'audit_logs', 'accounts'))
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

create or replace function app_private.has_sensitive_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_owner() or exists (
    select 1
    from public.user_profiles profile
    join public.user_sensitive_permissions permission on permission.user_id = profile.auth_user_id
    where profile.auth_user_id = (select auth.uid())
      and profile.status = 'active'
      and profile.account_type = 'custom'
      and not (profile.account_plan = 'free_single' and requested_permission in (
        'view_contract_files', 'view_rent_files', 'view_expense_files', 'view_attachments',
        'download_files', 'upload_files', 'replace_files', 'delete_files',
        'view_partnership_settlement', 'view_audit_logs', 'manage_accounts'
      ))
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

-- These legacy permissive policies predate workspace/permission checks. Since
-- RLS policies are ORed, they would otherwise bypass the free-plan boundary.
drop policy if exists contract_files_select_own on public.contract_files;
drop policy if exists contract_files_insert_own on public.contract_files;
drop policy if exists contract_files_update_own on public.contract_files;
drop policy if exists contract_files_delete_own on public.contract_files;
drop policy if exists expense_files_select_own on public.expense_files;
drop policy if exists expense_files_insert_own on public.expense_files;
drop policy if exists expense_files_update_own on public.expense_files;
drop policy if exists expense_files_delete_own on public.expense_files;
drop policy if exists rent_payment_files_select_own on public.rent_payment_files;
drop policy if exists rent_payment_files_insert_own on public.rent_payment_files;
drop policy if exists rent_payment_files_update_own on public.rent_payment_files;
drop policy if exists rent_payment_files_delete_own on public.rent_payment_files;

drop policy if exists contract_files_storage_select_own on storage.objects;
drop policy if exists contract_files_storage_insert_own on storage.objects;
drop policy if exists contract_files_storage_update_own on storage.objects;
drop policy if exists contract_files_storage_delete_own on storage.objects;
drop policy if exists expense_files_storage_select_own on storage.objects;
drop policy if exists expense_files_storage_insert_own on storage.objects;
drop policy if exists expense_files_storage_update_own on storage.objects;
drop policy if exists expense_files_storage_delete_own on storage.objects;
drop policy if exists rent_payment_files_storage_select_own on storage.objects;
drop policy if exists rent_payment_files_storage_insert_own on storage.objects;
drop policy if exists rent_payment_files_storage_update_own on storage.objects;
drop policy if exists rent_payment_files_storage_delete_own on storage.objects;

drop policy if exists "Users can upload own system backups" on storage.objects;
drop policy if exists "Users can read own system backups" on storage.objects;
drop policy if exists "Users can update own system backups" on storage.objects;

create policy "managed accounts can upload system backups" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'system-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not app_private.is_free_single_account()
  );
create policy "managed accounts can read system backups" on storage.objects
  for select to authenticated using (
    bucket_id = 'system-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not app_private.is_free_single_account()
  );
create policy "managed accounts can update system backups" on storage.objects
  for update to authenticated using (
    bucket_id = 'system-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not app_private.is_free_single_account()
  ) with check (
    bucket_id = 'system-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not app_private.is_free_single_account()
  );

revoke all on function app_private.is_free_single_account() from public;
grant execute on function app_private.is_free_single_account() to authenticated;

commit;
