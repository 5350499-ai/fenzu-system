-- Permit only the service-role Restore transaction to bypass ordinary
-- business edit triggers. Normal authenticated writes keep their checks.

create or replace function app_private.enforce_business_update_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_key text := tg_argv[0];
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
  archive_words text[] := array['已归档','已退租','已结束','已作废'];
  archive_change boolean := false;
  word text;
begin
  if current_setting('app.restore_mode', true) = 'on'
     and current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  if app_private.is_owner() then return new; end if;
  foreach word in array archive_words loop
    if coalesce(old_data->>'status','') is distinct from coalesce(new_data->>'status','')
       and (coalesce(old_data->>'status','') like '%' || word || '%' or coalesce(new_data->>'status','') like '%' || word || '%') then
      archive_change := true;
    end if;
    if coalesce(old_data->>'notes','') is distinct from coalesce(new_data->>'notes','')
       and (coalesce(old_data->>'notes','') like '%' || word || '%' or coalesce(new_data->>'notes','') like '%' || word || '%') then
      archive_change := true;
    end if;
  end loop;
  if archive_change and not app_private.has_module_permission(module_key, 'archive') then
    raise exception 'permission denied: archive';
  elsif not archive_change and not app_private.has_module_permission(module_key, 'edit') then
    raise exception 'permission denied: edit';
  end if;
  return new;
end;
$$;

-- Keep the already reviewed Restore implementation intact. A narrow wrapper
-- establishes a transaction-local context before delegating to it.
alter function public.restore_workspace_backup(uuid, uuid, jsonb)
  rename to restore_workspace_backup_impl;

revoke all on function public.restore_workspace_backup_impl(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.restore_workspace_backup(
  p_workspace_owner_id uuid,
  p_actor_account_id uuid,
  p_data jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.user_profiles
    where auth_user_id = p_actor_account_id
      and workspace_owner_id = p_workspace_owner_id
      and account_type = 'owner'
      and status = 'active'
  ) then
    raise exception 'Only an active workspace owner may restore a backup' using errcode = '42501';
  end if;

  perform set_config('app.restore_mode', 'on', true);
  perform public.restore_workspace_backup_impl(p_workspace_owner_id, p_actor_account_id, p_data);
end;
$$;

revoke all on function public.restore_workspace_backup(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup(uuid, uuid, jsonb) to service_role;
