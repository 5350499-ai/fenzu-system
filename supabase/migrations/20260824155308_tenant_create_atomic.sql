-- Atomic, idempotent tenant-create core. Existing generic edits remain unchanged.
begin;

create table if not exists public.tenant_create_requests (
  client_request_id uuid primary key,
  actor_user_id uuid not null references auth.users(id),
  workspace_owner_id uuid not null references auth.users(id),
  tenant_id uuid references public.tenants(id),
  contract_id uuid references public.contracts(id),
  rent_payment_id uuid references public.rent_payments(id),
  deposit_id uuid references public.deposits(id),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.tenant_create_requests enable row level security;
revoke all on public.tenant_create_requests from public, anon, authenticated;

create or replace function public.create_tenant_atomic(
  p_client_request_id uuid, p_property_id uuid, p_room_id uuid,
  p_tenant_name text, p_phone text, p_wechat text, p_source text, p_tenant_status text,
  p_monthly_rent numeric, p_occupant_count smallint, p_payment_day smallint,
  p_contract_start_date date, p_contract_end_date date, p_coverage_start_date date, p_coverage_end_date date,
  p_payment_date date, p_rent_amount numeric, p_deposit_amount numeric,
  p_payment_status text, p_payment_method text, p_received_by text, p_notes text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.user_profiles%rowtype;
  v_room public.rooms%rowtype;
  v_request public.tenant_create_requests%rowtype;
  v_claimed uuid;
  v_tenant public.tenants%rowtype;
  v_contract public.contracts%rowtype;
  v_payment public.rent_payments%rowtype;
  v_deposit public.deposits%rowtype;
  v_tenant_id uuid := gen_random_uuid();
  v_contract_id uuid := gen_random_uuid();
  v_payment_id uuid;
  v_deposit_id uuid;
  v_rent_paid numeric := case when coalesce(p_payment_status, '已收') = '未收' then 0 else coalesce(p_rent_amount, 0) end;
  v_rent_unpaid numeric := case when coalesce(p_payment_status, '已收') = '未收' then coalesce(p_rent_amount, 0) else 0 end;
  v_has_payment boolean := coalesce(p_rent_amount, 0) > 0;
  v_result jsonb;
  v_marker text;
begin
  if auth.uid() is null or not app_private.is_app_session_valid() then raise exception using errcode = '42501', message = 'permission denied: invalid session'; end if;
  select * into v_actor from public.user_profiles where auth_user_id = auth.uid() and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'permission denied: inactive account'; end if;
  if not app_private.has_module_permission('tenants', 'create') or not app_private.has_module_permission('rooms', 'edit')
     or (v_has_payment and not app_private.has_module_permission('rent_payments', 'create'))
     or (coalesce(p_deposit_amount, 0) > 0 and not app_private.has_module_permission('deposits', 'create'))
     or not app_private.can_access_property(p_property_id) then raise exception using errcode = '42501', message = 'permission denied: tenant create'; end if;
  if p_client_request_id is null or p_property_id is null or p_room_id is null or btrim(coalesce(p_tenant_name, '')) = ''
     or p_contract_start_date is null or p_coverage_start_date is null or p_coverage_end_date is null or p_payment_date is null
     or p_coverage_end_date < p_coverage_start_date or coalesce(p_monthly_rent, 0) < 0 or coalesce(p_rent_amount, 0) < 0
     or coalesce(p_deposit_amount, 0) < 0 or p_monthly_rent = 'NaN'::numeric or p_rent_amount = 'NaN'::numeric or p_deposit_amount = 'NaN'::numeric
     or coalesce(p_occupant_count, 1) < 1 or coalesce(p_payment_day, 20) not between 1 and 31
     or coalesce(p_tenant_status, '在租') not in ('在租', '空置') or coalesce(p_payment_status, '已收') not in ('已收', '未收')
     or btrim(coalesce(p_received_by, '')) = '' then raise exception using errcode = '22023', message = 'invalid tenant create data'; end if;
  if not exists (select 1 from public.partners where workspace_owner_id = v_actor.workspace_owner_id and is_active = true and (id::text = p_received_by or legacy_code = p_received_by)) then raise exception using errcode = '22023', message = 'invalid receipt attribution'; end if;
  insert into public.tenant_create_requests(client_request_id, actor_user_id, workspace_owner_id)
  values (p_client_request_id, v_actor.auth_user_id, v_actor.workspace_owner_id) on conflict (client_request_id) do nothing returning client_request_id into v_claimed;
  if v_claimed is null then
    select * into v_request from public.tenant_create_requests where client_request_id = p_client_request_id and actor_user_id = v_actor.auth_user_id and workspace_owner_id = v_actor.workspace_owner_id;
    if not found or v_request.completed_at is null or v_request.result is null then raise exception using errcode = '23505', message = 'tenant create request conflict'; end if;
    return v_request.result || jsonb_build_object('idempotentReplay', true);
  end if;
  select * into v_room from public.rooms where id = p_room_id and property_id = p_property_id and user_id = v_actor.workspace_owner_id for update;
  if not found or coalesce(v_room.status, '') like '%归档%' then raise exception using errcode = 'P0001', message = 'room unavailable'; end if;
  if v_has_payment then v_payment_id := gen_random_uuid(); end if;
  insert into public.tenants(id,user_id,property_id,room_id,name,phone,wechat,source,monthly_rent,deposit_amount,occupant_count,payment_day,status,notes)
  values(v_tenant_id,v_actor.workspace_owner_id,p_property_id,p_room_id,btrim(p_tenant_name),nullif(btrim(coalesce(p_phone,'')),''),nullif(btrim(coalesce(p_wechat,'')),''),coalesce(nullif(btrim(coalesce(p_source,'')),''),'其他'),p_monthly_rent,p_deposit_amount,p_occupant_count,p_payment_day,p_tenant_status,nullif(btrim(coalesce(p_notes,'')),'')) returning * into v_tenant;
  insert into public.contracts(id,user_id,property_id,room_id,tenant_id,monthly_rent,deposit_amount,start_date,end_date,coverage_start_date,coverage_end_date,status,notes)
  values(v_contract_id,v_actor.workspace_owner_id,p_property_id,p_room_id,v_tenant_id,p_monthly_rent,p_deposit_amount,p_contract_start_date,p_contract_end_date,p_coverage_start_date,p_coverage_end_date,'有效',nullif(btrim(coalesce(p_notes,'')),'')) returning * into v_contract;
  if v_has_payment then
    insert into public.rent_payments(id,user_id,tenant_id,property_id,room_id,rent_month,amount_due,amount_paid,amount_unpaid,payment_date,payment_method,is_overdue,notes,received_by,payment_status,income_type,client_request_id,coverage_start_date,coverage_end_date)
    values(v_payment_id,v_actor.workspace_owner_id,v_tenant_id,p_property_id,p_room_id,date_trunc('month',p_coverage_start_date)::date,p_rent_amount,v_rent_paid,v_rent_unpaid,p_payment_date,coalesce(nullif(btrim(coalesce(p_payment_method,'')),''),'转账'),false,nullif(btrim(coalesce(p_notes,'')),''),p_received_by,p_payment_status,'房租收入',p_client_request_id,p_coverage_start_date,p_coverage_end_date) returning * into v_payment;
  end if;
  if coalesce(p_deposit_amount,0) > 0 then
    v_deposit_id := gen_random_uuid(); v_marker := case when v_payment_id is null then '租客建立时收取押金' else '[收租押金:' || v_payment_id::text || ']' end;
    insert into public.deposits(id,user_id,tenant_id,property_id,room_id,transaction_type,amount,transaction_date,status,notes,received_by,paid_by)
    values(v_deposit_id,v_actor.workspace_owner_id,v_tenant_id,p_property_id,p_room_id,'收取',p_deposit_amount,p_payment_date,'已收',concat_ws(E'\n',v_marker,nullif(btrim(coalesce(p_notes,'')),'')),p_received_by,p_received_by) returning * into v_deposit;
  end if;
  if exists(select 1 from public.tenants where user_id=v_actor.workspace_owner_id and room_id=p_room_id and (status like '%在租%' or status in ('即将退租','欠租'))) then update public.rooms set status='已租', updated_at=now() where id=p_room_id returning * into v_room; elsif v_room.status in ('已租','预订中','即将退租') then update public.rooms set status='空置', updated_at=now() where id=p_room_id returning * into v_room; end if;
  v_result := jsonb_build_object('clientRequestId',p_client_request_id,'tenant',jsonb_build_object('id',v_tenant.id,'createdAt',v_tenant.created_at,'propertyId',v_tenant.property_id,'roomId',v_tenant.room_id,'name',v_tenant.name,'phone',coalesce(v_tenant.phone,''),'wechat',coalesce(v_tenant.wechat,''),'source',v_tenant.source,'monthlyRent',v_tenant.monthly_rent,'depositAmount',v_tenant.deposit_amount,'occupantCount',v_tenant.occupant_count,'paymentDay',v_tenant.payment_day,'status',v_tenant.status,'notes',coalesce(v_tenant.notes,'')),'room',jsonb_build_object('id',v_room.id,'propertyId',v_room.property_id,'name',v_room.name,'roomNumber',coalesce(v_room.room_number,''),'monthlyRent',v_room.monthly_rent,'depositAmount',v_room.deposit_amount,'status',v_room.status,'notes',coalesce(v_room.notes,'')),'contract',jsonb_build_object('id',v_contract.id,'propertyId',v_contract.property_id,'roomId',v_contract.room_id,'tenantId',v_contract.tenant_id,'startDate',v_contract.start_date,'endDate',coalesce(v_contract.end_date::text,''),'coverageStartDate',coalesce(v_contract.coverage_start_date::text,''),'coverageEndDate',coalesce(v_contract.coverage_end_date::text,''),'monthlyRent',v_contract.monthly_rent,'depositAmount',v_contract.deposit_amount,'status',v_contract.status,'notes',coalesce(v_contract.notes,'')),'rentPayment',case when v_payment_id is null then null else jsonb_build_object('id',v_payment.id,'clientRequestId',v_payment.client_request_id,'propertyId',v_payment.property_id,'roomId',v_payment.room_id,'tenantId',v_payment.tenant_id,'incomeType',v_payment.income_type,'rentMonth',to_char(v_payment.rent_month,'YYYY-MM'),'paymentDate',v_payment.payment_date,'amountDue',v_payment.amount_due,'amountPaid',v_payment.amount_paid,'amountUnpaid',v_payment.amount_unpaid,'coverageStartDate',v_payment.coverage_start_date,'coverageEndDate',v_payment.coverage_end_date,'receivedBy',v_payment.received_by,'paymentStatus',v_payment.payment_status,'paymentMethod',v_payment.payment_method,'isOverdue',v_payment.is_overdue,'notes',coalesce(v_payment.notes,'')) end,'deposit',case when v_deposit_id is null then null else jsonb_build_object('id',v_deposit.id,'propertyId',v_deposit.property_id,'roomId',v_deposit.room_id,'tenantId',v_deposit.tenant_id,'type','收取','amount',v_deposit.amount,'status',v_deposit.status,'transactionDate',v_deposit.transaction_date,'receivedBy',v_deposit.received_by,'paidBy',v_deposit.paid_by,'notes',coalesce(v_deposit.notes,'')) end,'rentAmount',p_rent_amount,'depositAmount',p_deposit_amount,'totalReceived',v_rent_paid + p_deposit_amount,'idempotentReplay',false);
  update public.tenant_create_requests set tenant_id=v_tenant_id,contract_id=v_contract_id,rent_payment_id=v_payment_id,deposit_id=v_deposit_id,result=v_result,completed_at=now() where client_request_id=p_client_request_id;
  insert into public.audit_logs(log_category,actor_user_id,actor_username,actor_display_name,session_id,action_type,module_key,entity_type,entity_id,property_id,room_id,tenant_id,after_data,amount,description,success) values('business',v_actor.auth_user_id,v_actor.username,v_actor.display_name,auth.jwt()->>'session_id','create_tenant','tenants','tenant',v_tenant_id,p_property_id,p_room_id,v_tenant_id,jsonb_build_object('tenantId',v_tenant_id,'contractId',v_contract_id,'rentPaymentId',v_payment_id,'depositId',v_deposit_id,'rentAmount',p_rent_amount,'depositAmount',p_deposit_amount,'totalAmount',v_rent_paid+p_deposit_amount),v_rent_paid+p_deposit_amount,'新增租客',true);
  return v_result;
end; $$;
alter function public.create_tenant_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,smallint,smallint,date,date,date,date,date,numeric,numeric,text,text,text,text) owner to postgres;
revoke all on function public.create_tenant_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,smallint,smallint,date,date,date,date,date,numeric,numeric,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_tenant_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,smallint,smallint,date,date,date,date,date,numeric,numeric,text,text,text,text) to authenticated;
commit;
