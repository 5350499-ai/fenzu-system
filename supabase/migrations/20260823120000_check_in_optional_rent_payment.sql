-- Keep check-in atomic while separating rent and deposit semantics.
-- A rent payment is created only when rent due, paid, or unpaid has business meaning.
-- Existing rows are not modified by this migration.

begin;

create or replace function public.create_atomic_check_in(
  p_client_request_id uuid,
  p_property_id uuid,
  p_room_id uuid,
  p_tenant_name text,
  p_phone text,
  p_document_number text,
  p_monthly_rent numeric,
  p_rent_amount numeric,
  p_deposit_amount numeric,
  p_payment_day smallint,
  p_payment_date date,
  p_coverage_start_date date,
  p_coverage_end_date date,
  p_contract_end_date date,
  p_deposit_status text,
  p_payment_status text,
  p_payment_method text,
  p_received_by text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.user_profiles%rowtype;
  v_room public.rooms%rowtype;
  v_request public.check_in_requests%rowtype;
  v_claimed uuid;
  v_tenant_id uuid := gen_random_uuid();
  v_contract_id uuid := gen_random_uuid();
  v_payment_id uuid;
  v_deposit_id uuid;
  v_monthly_rent numeric;
  v_collected_deposit numeric;
  v_rent_due numeric := coalesce(p_rent_amount, 0);
  v_rent_paid numeric;
  v_rent_unpaid numeric;
  v_total_received numeric;
  v_has_rent_state boolean;
  v_result jsonb;
  v_notes text;
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

  if not app_private.has_module_permission('check_in', 'create')
     or not app_private.has_module_permission('tenants', 'create')
     or not app_private.has_module_permission('rooms', 'edit')
     or not app_private.has_module_permission('rent_payments', 'create')
     or (coalesce(p_deposit_amount, 0) > 0 and not app_private.has_module_permission('deposits', 'create')) then
    raise exception using errcode = '42501', message = 'permission denied: check-in';
  end if;
  if not app_private.can_access_property(p_property_id) then
    raise exception using errcode = '42501', message = 'permission denied: property';
  end if;

  if p_client_request_id is null
     or p_property_id is null
     or p_room_id is null
     or btrim(coalesce(p_tenant_name, '')) = ''
     or p_payment_date is null
     or p_coverage_start_date is null
     or p_coverage_end_date is null
     or p_coverage_end_date < p_coverage_start_date
     or v_rent_due < 0
     or coalesce(p_deposit_amount, 0) < 0
     or coalesce(p_payment_day, 20) not between 1 and 31 then
    raise exception using errcode = '22023', message = 'invalid check-in data';
  end if;

  insert into public.check_in_requests (client_request_id, actor_user_id, workspace_owner_id)
  values (p_client_request_id, v_actor.auth_user_id, v_actor.workspace_owner_id)
  on conflict (client_request_id) do nothing
  returning client_request_id into v_claimed;

  if v_claimed is null then
    select * into v_request
    from public.check_in_requests
    where client_request_id = p_client_request_id
      and actor_user_id = v_actor.auth_user_id
      and workspace_owner_id = v_actor.workspace_owner_id;
    if not found or v_request.completed_at is null or v_request.result is null then
      raise exception using errcode = '23505', message = 'check-in request conflict';
    end if;
    return v_request.result || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
    and property_id = p_property_id
    and user_id = v_actor.workspace_owner_id
  for update;
  if not found
     or coalesce(v_room.status, '') in ('已租', 'occupied')
     or exists (
       select 1 from public.tenants
       where room_id = p_room_id
         and status in ('在租', 'current')
     )
     or coalesce(v_room.status, '') like '%归档%' then
    raise exception using errcode = 'P0001', message = 'room unavailable';
  end if;

  v_monthly_rent := case when coalesce(p_monthly_rent, 0) > 0 then p_monthly_rent else v_rent_due end;
  v_collected_deposit := case when p_deposit_status = '已收' then coalesce(p_deposit_amount, 0) else 0 end;
  v_rent_paid := case when p_payment_status = '已收' then v_rent_due else 0 end;
  v_rent_unpaid := case when p_payment_status = '未收' then v_rent_due else 0 end;
  v_total_received := v_rent_paid + v_collected_deposit;
  v_has_rent_state := v_rent_due > 0 or v_rent_paid > 0 or v_rent_unpaid > 0;
  if v_has_rent_state then
    v_payment_id := gen_random_uuid();
  end if;
  v_notes := concat_ws(E'\n', nullif('证件号：' || btrim(coalesce(p_document_number, '')), '证件号：'), nullif(btrim(coalesce(p_notes, '')), ''));

  insert into public.tenants (
    id, user_id, property_id, room_id, name, phone, source,
    monthly_rent, deposit_amount, payment_day, status, notes
  ) values (
    v_tenant_id, v_actor.workspace_owner_id, p_property_id, p_room_id,
    btrim(p_tenant_name), nullif(btrim(coalesce(p_phone, '')), ''), '其他',
    v_monthly_rent, coalesce(p_deposit_amount, 0), coalesce(p_payment_day, 20), '在租', nullif(v_notes, '')
  );

  insert into public.contracts (
    id, user_id, property_id, room_id, tenant_id, monthly_rent,
    deposit_amount, start_date, end_date, status, notes
  ) values (
    v_contract_id, v_actor.workspace_owner_id, p_property_id, p_room_id, v_tenant_id, v_monthly_rent,
    coalesce(p_deposit_amount, 0), p_coverage_start_date, p_contract_end_date, '有效', nullif(btrim(coalesce(p_notes, '')), '')
  );

  if v_has_rent_state then
    insert into public.rent_payments (
      id, user_id, tenant_id, property_id, room_id, rent_month,
      amount_due, amount_paid, amount_unpaid, payment_date, payment_method,
      is_overdue, notes, received_by, coverage_start_date, coverage_end_date,
      payment_status, income_type, income_item
    ) values (
      v_payment_id, v_actor.workspace_owner_id, v_tenant_id, p_property_id, p_room_id,
      date_trunc('month', p_coverage_start_date)::date, v_rent_due, v_rent_paid, v_rent_unpaid, p_payment_date,
      coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), '转账'),
      p_payment_status = '未收' and p_coverage_end_date < current_date,
      nullif(btrim(coalesce(p_notes, '')), ''),
      coalesce(nullif(btrim(coalesce(p_received_by, '')), ''), 'A'),
      p_coverage_start_date, p_coverage_end_date,
      coalesce(nullif(btrim(coalesce(p_payment_status, '')), ''), '已收'), '房租收入', null
    );
  end if;

  if coalesce(p_deposit_amount, 0) > 0 then
    v_deposit_id := gen_random_uuid();
    insert into public.deposits (
      id, user_id, tenant_id, property_id, room_id, transaction_type,
      amount, transaction_date, status, notes, received_by, paid_by
    ) values (
      v_deposit_id, v_actor.workspace_owner_id, v_tenant_id, p_property_id, p_room_id,
      '收取', p_deposit_amount, p_payment_date,
      coalesce(nullif(btrim(coalesce(p_deposit_status, '')), ''), '已收'),
      nullif(btrim(coalesce(p_notes, '')), ''),
      coalesce(nullif(btrim(coalesce(p_received_by, '')), ''), 'A'), 'A'
    );
  end if;

  update public.rooms
  set status = '已租', monthly_rent = v_monthly_rent, deposit_amount = coalesce(p_deposit_amount, 0), updated_at = now()
  where id = p_room_id;

  v_result := jsonb_build_object(
    'clientRequestId', p_client_request_id,
    'tenantId', v_tenant_id,
    'contractId', v_contract_id,
    'rentPaymentId', v_payment_id,
    'depositId', v_deposit_id,
    'monthlyRent', v_monthly_rent,
    'rentAmount', v_rent_due,
    'rentReceived', v_rent_paid,
    'depositAmount', coalesce(p_deposit_amount, 0),
    'totalReceived', v_total_received,
    'coverageStartDate', p_coverage_start_date,
    'coverageEndDate', p_coverage_end_date,
    'idempotentReplay', false
  );

  update public.check_in_requests
  set tenant_id = v_tenant_id, contract_id = v_contract_id, rent_payment_id = v_payment_id,
      deposit_id = v_deposit_id, result = v_result, completed_at = now()
  where client_request_id = p_client_request_id;

  insert into public.audit_logs (
    log_category, actor_user_id, actor_username, actor_display_name, session_id,
    action_type, module_key, entity_type, entity_id, property_id, room_id, tenant_id,
    before_data, after_data, amount, description, success
  ) values (
    'business', v_actor.auth_user_id, v_actor.username, v_actor.display_name, auth.jwt()->>'session_id',
    'create_check_in', 'check_in', 'check_in', v_tenant_id, p_property_id, p_room_id, v_tenant_id, null,
    jsonb_build_object(
      'tenantId', v_tenant_id, 'contractId', v_contract_id, 'rentPaymentId', v_payment_id, 'depositId', v_deposit_id,
      'tenantName', btrim(p_tenant_name), 'monthlyRent', v_monthly_rent, 'rentAmount', v_rent_due,
      'depositAmount', coalesce(p_deposit_amount, 0), 'coverageStartDate', p_coverage_start_date, 'coverageEndDate', p_coverage_end_date
    ), v_total_received, '一键入住', true
  );

  return v_result;
end;
$$;

revoke all on function public.create_atomic_check_in(
  uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, smallint,
  date, date, date, date, text, text, text, text, text
) from public, anon;
grant execute on function public.create_atomic_check_in(
  uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, smallint,
  date, date, date, date, text, text, text, text, text
) to authenticated;

commit;
