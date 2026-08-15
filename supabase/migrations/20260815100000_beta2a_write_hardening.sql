begin;

-- Beta 2A: server-persisted rent-payment retry identity. Existing rows remain
-- valid and are intentionally left without an identity.
alter table public.rent_payments
  add column if not exists client_request_id uuid;

create unique index if not exists rent_payments_workspace_client_request_id_idx
  on public.rent_payments (user_id, client_request_id)
  where client_request_id is not null;

comment on column public.rent_payments.client_request_id is
  'Client-generated identity for a new rent-payment action; scoped by user_id and immutable after creation.';

-- One transaction owns the tenant lifecycle, active contract, room occupancy,
-- and current deposit state. Notifications and cache refresh remain outside
-- this database boundary.
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

  if not app_private.has_module_permission('tenants', 'archive') then
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

  select status, actual_move_out_date into v_final_tenant_status, v_final_move_out_date
  from public.tenants where id = v_tenant.id;
  select status into v_final_room_status from public.rooms where id = v_room.id;
  v_after := jsonb_build_object(
    'tenantStatus', v_final_tenant_status,
    'actualMoveOutDate', v_final_move_out_date,
    'roomStatus', v_final_room_status,
    'depositStatus', p_deposit_status,
    'alreadyMovedOut', v_already_moved_out
  );
  v_result := jsonb_build_object(
    'tenantId', v_tenant.id,
    'propertyId', v_tenant.property_id,
    'roomId', v_tenant.room_id,
    'alreadyMovedOut', v_already_moved_out,
    'tenantStatus', v_final_tenant_status,
    'roomStatus', v_final_room_status,
    'actualMoveOutDate', v_final_move_out_date,
    'depositStatus', p_deposit_status
  );

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

revoke all on function public.move_out_tenant_atomic(uuid, text, date) from public, anon;
grant execute on function public.move_out_tenant_atomic(uuid, text, date) to authenticated;

comment on function public.move_out_tenant_atomic(uuid, text, date) is
  'Atomically ends a tenant relationship, active contract, current deposit state and room occupancy within the authenticated workspace.';

commit;

-- Rollback / recovery notes:
-- 1. Revoke execution and drop the function only after application rollback.
-- 2. Drop the partial unique index and client_request_id column only if no
--    deployed application version depends on persisted retry identities.
-- 3. No existing business row is rewritten or deleted by this migration.
