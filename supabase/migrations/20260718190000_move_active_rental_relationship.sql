-- Move a tenant's current active rental relationship atomically.
-- Ended/archived contracts and older payment periods remain immutable.

begin;

create or replace function public.update_tenant_current_assignment(
  p_tenant_id uuid,
  p_property_id uuid,
  p_room_id uuid,
  p_name text,
  p_phone text,
  p_wechat text,
  p_source text,
  p_monthly_rent numeric,
  p_deposit_amount numeric,
  p_payment_day smallint,
  p_status text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.user_profiles%rowtype;
  v_tenant public.tenants%rowtype;
  v_old_room public.rooms%rowtype;
  v_new_room public.rooms%rowtype;
  v_old_room_status text;
  v_new_room_status text;
  v_old_active_count integer;
  v_new_active_count integer;
  v_current_coverage_end date;
  v_contract_ids uuid[] := array[]::uuid[];
  v_deposit_ids uuid[] := array[]::uuid[];
  v_payment_ids uuid[] := array[]::uuid[];
  v_result jsonb;
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

  if not app_private.has_module_permission('tenants', 'edit')
     or not app_private.has_module_permission('rooms', 'edit') then
    raise exception using errcode = '42501', message = 'permission denied: tenant room move';
  end if;

  if p_tenant_id is null or p_property_id is null or p_room_id is null
     or btrim(coalesce(p_name, '')) = ''
     or coalesce(p_monthly_rent, 0) < 0
     or coalesce(p_deposit_amount, 0) < 0
     or (p_payment_day is not null and p_payment_day not between 1 and 31) then
    raise exception using errcode = '22023', message = 'invalid tenant data';
  end if;

  select * into v_tenant
  from public.tenants
  where id = p_tenant_id and user_id = v_actor.workspace_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'tenant not found';
  end if;

  if not app_private.can_access_property(v_tenant.property_id)
     or not app_private.can_access_property(p_property_id) then
    raise exception using errcode = '42501', message = 'permission denied: property';
  end if;

  perform 1
  from public.rooms
  where id in (v_tenant.room_id, p_room_id)
    and user_id = v_actor.workspace_owner_id
  order by id
  for update;

  select * into v_old_room
  from public.rooms
  where id = v_tenant.room_id and user_id = v_actor.workspace_owner_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'old room not found';
  end if;

  select * into v_new_room
  from public.rooms
  where id = p_room_id
    and property_id = p_property_id
    and user_id = v_actor.workspace_owner_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'new room not found';
  end if;

  v_old_room_status := v_old_room.status;
  v_new_room_status := v_new_room.status;

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_contract_ids
  from public.contracts
  where tenant_id = p_tenant_id
    and user_id = v_actor.workspace_owner_id
    and status not in ('已结束', '已归档', '已退租', 'ended', 'archived')
    and (end_date is null or end_date >= current_date);

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_deposit_ids
  from public.deposits
  where tenant_id = p_tenant_id
    and user_id = v_actor.workspace_owner_id
    and transaction_type in ('收取', 'collected')
    and status not in ('已退', '已退还', '已作废', '已归档', 'refunded', 'voided', 'archived');

  select max(coverage_end_date)
  into v_current_coverage_end
  from public.rent_payments
  where tenant_id = p_tenant_id
    and user_id = v_actor.workspace_owner_id
    and coverage_end_date is not null
    and income_type in ('房租收入', '续交房租')
    and payment_status not in ('已作废', '作废')
    and coalesce(notes, '') not like '%[已作废]%';

  if v_current_coverage_end is not null then
    select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_payment_ids
    from public.rent_payments
    where tenant_id = p_tenant_id
      and user_id = v_actor.workspace_owner_id
      and coverage_end_date = v_current_coverage_end
      and income_type in ('房租收入', '续交房租')
      and payment_status not in ('已作废', '作废')
      and coalesce(notes, '') not like '%[已作废]%';
  end if;

  update public.tenants
  set property_id = p_property_id,
      room_id = p_room_id,
      name = btrim(p_name),
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      wechat = nullif(btrim(coalesce(p_wechat, '')), ''),
      source = coalesce(nullif(btrim(coalesce(p_source, '')), ''), '其他'),
      monthly_rent = coalesce(p_monthly_rent, 0),
      deposit_amount = coalesce(p_deposit_amount, 0),
      payment_day = p_payment_day,
      status = coalesce(nullif(btrim(coalesce(p_status, '')), ''), v_tenant.status),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = p_tenant_id;

  update public.contracts
  set property_id = p_property_id, room_id = p_room_id, updated_at = now()
  where id = any(v_contract_ids);

  update public.deposits
  set property_id = p_property_id, room_id = p_room_id, updated_at = now()
  where id = any(v_deposit_ids);

  update public.rent_payments
  set property_id = p_property_id, room_id = p_room_id, updated_at = now()
  where id = any(v_payment_ids);

  select count(*) into v_old_active_count
  from public.tenants
  where room_id = v_old_room.id and status = '在租';

  select count(*) into v_new_active_count
  from public.tenants
  where room_id = v_new_room.id and status = '在租';

  update public.rooms
  set status = case when v_old_active_count > 0 then '已租' else '空置' end,
      updated_at = now()
  where id = v_old_room.id;

  if v_new_room.id <> v_old_room.id then
    update public.rooms
    set status = case when v_new_active_count > 0 then '已租' else '空置' end,
        updated_at = now()
    where id = v_new_room.id;
  end if;

  v_result := jsonb_build_object(
    'tenantId', p_tenant_id,
    'oldPropertyId', v_tenant.property_id,
    'newPropertyId', p_property_id,
    'oldRoomId', v_tenant.room_id,
    'newRoomId', p_room_id,
    'activeContractIds', to_jsonb(v_contract_ids),
    'activeDepositIds', to_jsonb(v_deposit_ids),
    'currentPaymentIds', to_jsonb(v_payment_ids),
    'oldRoomStatusBefore', v_old_room_status,
    'oldRoomStatusAfter', case when v_old_active_count > 0 then '已租' else '空置' end,
    'newRoomStatusBefore', v_new_room_status,
    'newRoomStatusAfter', case when v_new_active_count > 0 then '已租' else '空置' end
  );

  insert into public.audit_logs (
    log_category, actor_user_id, actor_username, actor_display_name, session_id,
    action_type, module_key, entity_type, entity_id, property_id, room_id, tenant_id,
    before_data, after_data, description, success
  ) values (
    'business', v_actor.auth_user_id, v_actor.username, v_actor.display_name,
    auth.jwt()->>'session_id', 'move_active_rental_relationship', 'tenants', 'tenant', p_tenant_id,
    p_property_id, p_room_id, p_tenant_id,
    jsonb_build_object(
      'propertyId', v_tenant.property_id, 'roomId', v_tenant.room_id,
      'tenantName', v_tenant.name, 'oldRoomStatus', v_old_room_status
    ),
    v_result || jsonb_build_object('tenantName', btrim(p_name)),
    format('租客 %s 当前有效租赁关系由房间 %s 整体调整至 %s', btrim(p_name), v_tenant.room_id, p_room_id),
    true
  );

  return v_result;
end;
$$;

revoke all on function public.update_tenant_current_assignment(
  uuid, uuid, uuid, text, text, text, text, numeric, numeric, smallint, text, text
) from public, anon;
grant execute on function public.update_tenant_current_assignment(
  uuid, uuid, uuid, text, text, text, text, numeric, numeric, smallint, text, text
) to authenticated;

comment on function public.update_tenant_current_assignment(
  uuid, uuid, uuid, text, text, text, text, numeric, numeric, smallint, text, text
) is 'Atomically moves a tenant and the current active contract, deposit, and latest rent coverage period; ended history remains immutable.';

commit;

-- Non-destructive rollback: reapply 20260718163321_atomic_tenant_room_move.sql
-- to restore the prior tenant-and-room-only function. No table or business row is dropped.
