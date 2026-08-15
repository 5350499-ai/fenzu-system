-- Allow the closed-beta free-single workspace owner to use the existing
-- account-scoped restore transaction. Managed/delegated accounts remain
-- outside this boundary.

do $$
declare
  v_function text;
begin
  select pg_get_functiondef('public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure)
    into v_function;
  v_function := replace(
    v_function,
    'and account_type = ''owner''',
    'and (account_type = ''owner'' or (account_type = ''custom'' and account_plan = ''free_single''))'
  );
  execute v_function;
end;
$$;

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
      and status = 'active'
      and (
        account_type = 'owner'
        or (account_type = 'custom' and account_plan = 'free_single')
      )
  ) then
    raise exception 'Only an active workspace owner may restore a backup' using errcode = '42501';
  end if;

  perform set_config('app.restore_mode', 'on', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.restore_workspace_backup_impl(p_workspace_owner_id, p_actor_account_id, p_data);
end;
$$;

revoke all on function public.restore_workspace_backup(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup(uuid, uuid, jsonb) to service_role;
