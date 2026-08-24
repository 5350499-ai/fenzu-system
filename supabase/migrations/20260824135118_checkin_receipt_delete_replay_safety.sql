-- Check-in receipt deletion must preserve the server-owned idempotency record.
-- Only the canonical lifecycle RPC may clear its nullable receipt references,
-- and only after the complete payment/deposit/check-in identity graph is proven.
begin;

create or replace function public.permanently_delete_rent_payment_with_linked_deposit(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.user_profiles%rowtype;
  v_payment public.rent_payments%rowtype;
  v_deposit public.deposits%rowtype;
  v_check_in_request public.check_in_requests%rowtype;
  v_contract public.contracts%rowtype;
  v_marker text;
  v_candidate_count integer := 0;
  v_marker_count integer := 0;
  v_check_in_count integer := 0;
  v_legacy_mixed boolean := false;
  v_deposit_handled boolean := false;
  v_check_in_receipt boolean := false;
  v_rent_amount numeric := 0;
  v_deposit_amount numeric := 0;
  v_total_amount numeric := 0;
  v_classification text := 'RENT_ONLY';
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

  if not (app_private.has_module_permission('rent_payments', 'delete') or app_private.is_free_single_workspace_owner()) then
    raise exception using errcode = '42501', message = 'permission denied: delete rent payment';
  end if;

  select * into v_payment
  from public.rent_payments
  where id = p_payment_id and user_id = v_actor.workspace_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'rent payment not found';
  end if;
  if not app_private.can_access_property(v_payment.property_id) then
    raise exception using errcode = '42501', message = 'permission denied: property scope';
  end if;

  lock table public.deposits in share row exclusive mode;
  v_marker := '[收租押金:' || v_payment.id::text || ']';
  select count(*) into v_candidate_count
  from public.deposits d
  where pg_catalog.strpos(coalesce(d.notes, ''), v_marker) > 0;
  if v_candidate_count > 1 then
    raise exception using errcode = '21000', message = 'ambiguous linked deposit marker';
  end if;

  if v_candidate_count = 1 then
    select * into v_deposit
    from public.deposits d
    where pg_catalog.strpos(coalesce(d.notes, ''), v_marker) > 0
    for update;

    select count(*) into v_marker_count
    from pg_catalog.regexp_matches(coalesce(v_deposit.notes, ''), '\[收租押金:[^]]+\]', 'g');
    if v_marker_count <> 1
       or v_deposit.user_id <> v_payment.user_id
       or v_deposit.tenant_id is distinct from v_payment.tenant_id
       or v_deposit.property_id <> v_payment.property_id
       or v_deposit.room_id is distinct from v_payment.room_id
       or v_deposit.transaction_type not in ('收取', 'collected')
       or coalesce(v_payment.income_type, '房租收入') not in ('房租收入', '续交房租') then
      raise exception using errcode = '22023', message = 'invalid linked deposit identity';
    end if;

    v_deposit_amount := coalesce(v_deposit.amount, 0);
    v_legacy_mixed := v_deposit_amount > 0 and (
      pg_catalog.abs(coalesce(v_payment.amount_paid, 0) - (coalesce(v_payment.amount_due, 0) + v_deposit_amount)) < 0.005
      or (v_payment.payment_status = '未收'
          and pg_catalog.abs(coalesce(v_payment.amount_paid, 0) - v_deposit_amount) < 0.005)
    );
    v_classification := case when v_legacy_mixed then 'LEGACY_MIXED_RENEWAL' else 'NEW_SEPARATED_RENEWAL' end;

    if not (app_private.has_module_permission('deposits', 'delete') or app_private.is_free_single_workspace_owner()) then
      raise exception using errcode = '42501', message = 'permission denied: delete linked deposit';
    end if;

    select count(*) into v_check_in_count
    from public.check_in_requests r
    where r.rent_payment_id = v_payment.id
       or r.deposit_id = v_deposit.id;
    if v_check_in_count > 1 then
      raise exception using errcode = '21000', message = 'ambiguous check-in receipt relationship';
    end if;

    if v_check_in_count = 1 then
      select * into v_check_in_request
      from public.check_in_requests r
      where r.rent_payment_id = v_payment.id
         or r.deposit_id = v_deposit.id
      for update;

      if v_check_in_request.rent_payment_id is distinct from v_payment.id
         or v_check_in_request.deposit_id is distinct from v_deposit.id
         or v_check_in_request.workspace_owner_id <> v_payment.user_id
         or v_check_in_request.tenant_id is distinct from v_payment.tenant_id
         or v_check_in_request.contract_id is null
         or v_check_in_request.completed_at is null
         or v_check_in_request.result is null then
        raise exception using errcode = '22023', message = 'invalid check-in receipt relationship';
      end if;

      select * into v_contract
      from public.contracts c
      where c.id = v_check_in_request.contract_id
        and c.user_id = v_payment.user_id
      for key share;
      if not found
         or v_contract.tenant_id is distinct from v_payment.tenant_id
         or v_contract.property_id <> v_payment.property_id
         or v_contract.room_id is distinct from v_payment.room_id then
        raise exception using errcode = '22023', message = 'invalid check-in receipt relationship';
      end if;

      v_check_in_receipt := true;
      v_classification := case when v_legacy_mixed then 'LEGACY_MIXED_CHECKIN' else 'NEW_SEPARATED_CHECKIN' end;
    end if;
  end if;

  v_rent_amount := case
    when v_legacy_mixed then greatest(coalesce(v_payment.amount_paid, 0) - v_deposit_amount, 0)
    else coalesce(v_payment.amount_paid, 0)
  end;
  v_total_amount := case
    when v_legacy_mixed then coalesce(v_payment.amount_paid, 0)
    else v_rent_amount + v_deposit_amount
  end;

  if v_check_in_receipt then
    update public.check_in_requests
    set rent_payment_id = null,
        deposit_id = null,
        result = (v_check_in_request.result - 'rentPaymentId' - 'depositId')
          || pg_catalog.jsonb_build_object(
            'rentPaymentId', null,
            'depositId', null,
            'receiptDeleted', true,
            'receiptLifecycle', 'permanently_deleted',
            'receiptDeletedAt', pg_catalog.now()
          )
    where client_request_id = v_check_in_request.client_request_id;
  end if;

  if v_candidate_count = 1 then
    delete from public.deposits where id = v_deposit.id;
    v_deposit_handled := true;
  end if;

  delete from public.rent_payments where id = v_payment.id;

  insert into public.audit_logs (
    log_category, actor_user_id, actor_username, actor_display_name, session_id,
    action_type, module_key, entity_type, entity_id,
    property_id, room_id, tenant_id, before_data, after_data,
    amount, description, success
  ) values (
    'business', v_actor.auth_user_id, v_actor.username, v_actor.display_name,
    (select auth.jwt()->>'session_id'),
    'linked_receipt_delete', 'rent_payments', 'linked_receipt', v_payment.id,
    v_payment.property_id, v_payment.room_id, v_payment.tenant_id,
    pg_catalog.jsonb_build_object(
      'action', 'delete', 'result', 'success',
      'paymentId', v_payment.id,
      'depositId', case when v_candidate_count = 1 then v_deposit.id else null end,
      'checkInRequestId', case when v_check_in_receipt then v_check_in_request.client_request_id else null end,
      'contractId', case when v_check_in_receipt then v_check_in_request.contract_id else null end,
      'receiptOrigin', case when v_check_in_receipt then 'CHECK_IN' else 'RENT_PAYMENT' end,
      'propertyId', v_payment.property_id,
      'roomId', v_payment.room_id,
      'tenantId', v_payment.tenant_id,
      'workspaceOwnerId', v_actor.workspace_owner_id,
      'actorUserId', v_actor.auth_user_id,
      'rentAmount', v_rent_amount,
      'depositAmount', v_deposit_amount,
      'totalAmount', v_total_amount,
      'classification', v_classification,
      'paymentStatusBefore', v_payment.payment_status,
      'depositStatusBefore', case when v_candidate_count = 1 then v_deposit.status else null end
    ),
    pg_catalog.jsonb_build_object(
      'result', 'success',
      'paymentDeleted', true,
      'depositDeleted', v_deposit_handled,
      'checkInReceiptReferencesCleared', v_check_in_receipt
    ),
    v_total_amount, '永久删除关联收款', true
  );

  return pg_catalog.jsonb_build_object(
    'action', 'delete',
    'paymentId', v_payment.id,
    'linkedDepositId', case when v_candidate_count = 1 then v_deposit.id else null end,
    'linkedDepositHandled', v_deposit_handled,
    'checkInRequestId', case when v_check_in_receipt then v_check_in_request.client_request_id else null end,
    'checkInReceiptReferencesCleared', v_check_in_receipt,
    'legacyMixedDeposit', v_legacy_mixed
  );
end;
$$;

alter function public.permanently_delete_rent_payment_with_linked_deposit(uuid) owner to postgres;
revoke all on function public.permanently_delete_rent_payment_with_linked_deposit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.permanently_delete_rent_payment_with_linked_deposit(uuid) to authenticated;

commit;
