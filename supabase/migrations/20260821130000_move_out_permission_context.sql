begin;

-- Move-out is one authenticated business action. Its related contract,
-- deposit and room updates must not be re-authorized as unrelated edits.
create or replace function app_private.is_free_single_workspace_owner()
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
      and profile.workspace_owner_id = profile.auth_user_id
      and profile.account_type = 'custom'
      and profile.account_plan = 'free_single'
      and profile.status = 'active'
  );
$$;

create or replace function app_private.is_canonical_move_out_context()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.current_setting('app.canonical_move_out', true) = 'true';
$$;

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
  if app_private.is_owner() or app_private.is_canonical_move_out_context() then return new; end if;
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

create or replace function public.move_out_tenant_atomic(
  p_tenant_id uuid,
  p_deposit_status text,
  p_actual_move_out_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.user_profiles%rowtype;
  v_tenant public.tenants%rowtype;
  v_room public.rooms%rowtype;
  v_contract_ids uuid[] := array[]::uuid[];
  v_deposit_ids uuid[] := array[]::uuid[];
  v_active_count integer := 0;
  v_already_moved_out boolean := false;
  v_final_tenant_status text;
  v_final_move_out_date date;
  v_final_room_status text;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null or not app_private.is_app_session_valid() then
    raise exception using errcode = '42501', message = 'permission denied: invalid session';
  end if;

  select * into v_actor
  from public.user_profiles
  where auth_user_id = auth.uid() and status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'permission denied: inactive account';
  end if;

  if not (app_private.has_module_permission('tenants', 'archive') or app_private.is_free_single_workspace_owner()) then
    raise exception using errcode = '42501', message = 'permission denied: move out';
  end if;

  if p_tenant_id is null
     or p_deposit_status is null
     or p_deposit_status not in (U&'\5f85\9000', U&'\5df2\9000', U&'\5df2\9000\56de', 'pending', 'refunded') then
    raise exception using errcode = '22023', message = 'invalid move-out data';
  end if;

  select * into v_tenant
  from public.tenants
  where id = p_tenant_id and user_id = v_actor.workspace_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'tenant not found';
  end if;

  if v_tenant.status in (U&'\5df2\9000\79df', U&'\5df2\5f52\6863', U&'\5df2\7ed3\675f', U&'\975e\5728\79df', 'moved_out', 'archived', 'ended') then
    v_already_moved_out := true;
  end if;

  select * into v_room
  from public.rooms
  where id = v_tenant.room_id
    and property_id = v_tenant.property_id
    and user_id = v_actor.workspace_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'tenant room not found';
  end if;

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_contract_ids
  from public.contracts
  where tenant_id = v_tenant.id
    and user_id = v_actor.workspace_owner_id
    and status not in (U&'\5df2\7ed3\675f', U&'\5df2\5f52\6863', U&'\5df2\9000\79df', 'ended', 'archived')
    and (end_date is null or end_date >= current_date);

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_deposit_ids
  from public.deposits
  where tenant_id = v_tenant.id
    and user_id = v_actor.workspace_owner_id
    and transaction_type in (U&'\6536\53d6', 'collected')
    and status not in (U&'\5df2\9000', U&'\5df2\9000\56de', U&'\5df2\4f5c\5e9f', U&'\5df2\5f52\6863', 'refunded', 'voided', 'archived');

  v_before := jsonb_build_object(
    'tenantStatus', v_tenant.status,
    'actualMoveOutDate', v_tenant.actual_move_out_date,
    'roomStatus', v_room.status,
    'activeContractIds', to_jsonb(v_contract_ids),
    'depositIds', to_jsonb(v_deposit_ids)
  );

  -- This setting is transaction-local and only affects the related updates
  -- owned by this function. It does not grant a caller general table access.
  perform pg_catalog.set_config('app.canonical_move_out', 'true', true);

  if not v_already_moved_out then
    update public.tenants
    set status = U&'\5df2\9000\79df',
        actual_move_out_date = coalesce(p_actual_move_out_date, actual_move_out_date),
        updated_at = now()
    where id = v_tenant.id;

    update public.contracts
    set status = U&'\5df2\7ed3\675f',
        is_active = false,
        end_date = coalesce(p_actual_move_out_date, end_date, current_date),
        updated_at = now()
    where id = any(v_contract_ids);

    update public.deposits
    set status = p_deposit_status,
        updated_at = now()
    where id = any(v_deposit_ids);

    select count(*) into v_active_count
    from public.tenants
    where room_id = v_room.id
      and user_id = v_actor.workspace_owner_id
      and status not in (U&'\5df2\9000\79df', U&'\5df2\5f52\6863', U&'\5df2\7ed3\675f', U&'\975e\5728\79df', 'moved_out', 'archived', 'ended')
      and status not in (U&'\7a7a\7f6e', U&'\9884\5b9a\5165\4f4f', U&'\9884\8ba2\5165\4f4f');

    if v_room.status in (U&'\5df2\79df', U&'\5373\5c06\9000\79df', U&'\9884\5b9a\5165\4f4f', U&'\9884\8ba2\5165\4f4f', 'occupied', 'pending') then
      update public.rooms
      set status = case when v_active_count > 0 then U&'\5df2\79df' else U&'\7a7a\7f6e' end,
          updated_at = now()
      where id = v_room.id;
    end if;
  end if;

  select status, actual_move_out_date into v_final_tenant_status, v_final_move_out_date from public.tenants where id = v_tenant.id;
  select status into v_final_room_status from public.rooms where id = v_room.id;
  v_after := jsonb_build_object('tenantStatus', v_final_tenant_status, 'actualMoveOutDate', v_final_move_out_date, 'roomStatus', v_final_room_status, 'depositStatus', p_deposit_status, 'alreadyMovedOut', v_already_moved_out);
  v_result := jsonb_build_object('tenantId', v_tenant.id, 'propertyId', v_tenant.property_id, 'roomId', v_tenant.room_id, 'alreadyMovedOut', v_already_moved_out, 'tenantStatus', v_final_tenant_status, 'roomStatus', v_final_room_status, 'actualMoveOutDate', v_final_move_out_date, 'depositStatus', p_deposit_status);

  if not v_already_moved_out then
    insert into public.audit_logs (
      log_category, actor_user_id, actor_username, actor_display_name, session_id,
      action_type, module_key, entity_type, entity_id, property_id, room_id, tenant_id,
      before_data, after_data, description, success
    ) values (
      'business', v_actor.auth_user_id, v_actor.username, v_actor.display_name,
      auth.jwt()->>'session_id', 'move_out', 'tenants', 'tenant', v_tenant.id,
      v_tenant.property_id, v_tenant.room_id, v_tenant.id,
      v_before, v_after, 'Atomic tenant move-out', true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function app_private.is_free_single_workspace_owner() from public;
grant execute on function app_private.is_free_single_workspace_owner() to authenticated;
revoke all on function app_private.is_canonical_move_out_context() from public;
grant execute on function app_private.is_canonical_move_out_context() to authenticated;
revoke all on function public.move_out_tenant_atomic(uuid, text, date) from public, anon;
grant execute on function public.move_out_tenant_atomic(uuid, text, date) to authenticated;

commit;
