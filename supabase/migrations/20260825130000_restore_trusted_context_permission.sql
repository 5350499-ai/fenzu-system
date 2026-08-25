-- Make the server-owned Restore transaction visible to shared business
-- permission triggers without weakening ordinary CRUD authorization.

create or replace function app_private.is_trusted_restore_context()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_workspace uuid;
begin
  if pg_catalog.current_setting('app.restore_mode', true) is distinct from 'on'
     or pg_catalog.current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     or pg_catalog.current_setting('app.restore_context_scope', true) is distinct from 'transaction' then
    return false;
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('app.restore_actor_id', true), '')::uuid;
    v_workspace := nullif(pg_catalog.current_setting('app.restore_workspace_id', true), '')::uuid;
  exception when others then
    return false;
  end;

  if v_actor is null or v_workspace is null then return false; end if;

  return exists (
    select 1
    from public.user_profiles profile
    where profile.auth_user_id = v_actor
      and profile.workspace_owner_id = v_workspace
      and profile.status = 'active'
      and (
        profile.account_type = 'owner'
        or (profile.account_type = 'custom' and profile.account_plan = 'free_single' and profile.auth_user_id = profile.workspace_owner_id)
      )
  );
end;
$$;

revoke all on function app_private.is_trusted_restore_context() from public, anon, authenticated, service_role;

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
  if app_private.is_trusted_restore_context()
     or app_private.is_owner()
     or app_private.is_canonical_move_out_context() then
    return new;
  end if;
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

revoke all on function app_private.enforce_business_update_permission() from public, anon, authenticated, service_role;

do $migration$
declare
  v_source text;
  v_marker text := 'perform set_config(''app.restore_mode'', ''on'', true);';
  v_replacement text := E'perform set_config(''app.restore_mode'', ''on'', true);\n'
    || E'  perform set_config(''app.restore_context_scope'', ''transaction'', true);\n'
    || E'  perform set_config(''app.restore_actor_id'', p_actor_account_id::text, true);\n'
    || E'  perform set_config(''app.restore_workspace_id'', p_workspace_owner_id::text, true);\n'
    || E'  perform set_config(''request.jwt.claim.role'', ''service_role'', true);';
begin
  select pg_get_functiondef('public.restore_workspace_backup(uuid,uuid,jsonb)'::regprocedure)
    into v_source;
  if v_source is null then raise exception 'restore_workspace_backup was not found'; end if;
  if position(v_marker in v_source) = 0 then
    raise exception 'Restore context setup marker not found';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);
  execute v_source;
end;
$migration$;
