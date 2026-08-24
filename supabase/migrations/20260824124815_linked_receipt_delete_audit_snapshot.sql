-- Keep linked receipt lifecycle ownership and finance classification separate.
-- Exact, uniquely linked deposits are lifecycle-owned by the receipt even when
-- the historical payment amount already included the deposit. Both lifecycle
-- actions also write one immutable aggregate audit event in the same DB tx.
begin;

create or replace function public.void_rent_payment_with_linked_deposit(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.user_profiles%rowtype;
  v_payment public.rent_payments%rowtype;
  v_deposit public.deposits%rowtype;
  v_marker text;
  v_candidate_count integer := 0;
  v_marker_count integer := 0;
  v_legacy_mixed boolean := false;
  v_deposit_handled boolean := false;
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

  if not (app_private.has_module_permission('rent_payments', 'archive') or app_private.is_free_single_workspace_owner()) then
    raise exception using errcode = '42501', message = 'permission denied: void rent payment';
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

    if not v_legacy_mixed then
      if not (app_private.has_module_permission('deposits', 'archive') or app_private.is_free_single_workspace_owner()) then
        raise exception using errcode = '42501', message = 'permission denied: void linked deposit';
      end if;
      if v_deposit.status in ('已退', '已退回', 'refunded')
         and pg_catalog.strpos(coalesce(v_deposit.notes, ''), '[已作废]') = 0 then
        raise exception using errcode = '22023', message = 'linked deposit already refunded';
      end if;

      update public.deposits
      set status = '已作废',
          notes = case
            when pg_catalog.strpos(coalesce(notes, ''), '[已作废]') > 0 then notes
            when nullif(pg_catalog.btrim(coalesce(notes, '')), '') is null then '[已作废]'
            else '[已作废] ' || pg_catalog.btrim(notes)
          end,
          updated_at = pg_catalog.now()
      where id = v_deposit.id;
      v_deposit_handled := true;
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

  update public.rent_payments
  set notes = case
        when pg_catalog.strpos(coalesce(notes, ''), '[已作废]') > 0 then notes
        when nullif(pg_catalog.btrim(coalesce(notes, '')), '') is null then '[已作废]'
        else '[已作废] ' || pg_catalog.btrim(notes)
      end,
      updated_at = pg_catalog.now()
  where id = v_payment.id;

  insert into public.audit_logs (
    log_category, actor_user_id, actor_username, actor_display_name, session_id,
    action_type, module_key, entity_type, entity_id,
    property_id, room_id, tenant_id, before_data, after_data,
    amount, description, success
  ) values (
    'business', v_actor.auth_user_id, v_actor.username, v_actor.display_name,
    (select auth.jwt()->>'session_id'),
    'linked_receipt_void', 'rent_payments', 'linked_receipt', v_payment.id,
    v_payment.property_id, v_payment.room_id, v_payment.tenant_id,
    pg_catalog.jsonb_build_object(
      'action', 'void', 'result', 'success',
      'paymentId', v_payment.id,
      'depositId', case when v_candidate_count = 1 then v_deposit.id else null end,
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
      'paymentVoided', true,
      'depositVoided', v_deposit_handled
    ),
    v_total_amount, '作废关联收款', true
  );

  return pg_catalog.jsonb_build_object(
    'action', 'void',
    'paymentId', v_payment.id,
    'linkedDepositId', case when v_candidate_count = 1 then v_deposit.id else null end,
    'linkedDepositHandled', v_deposit_handled,
    'legacyMixedDeposit', v_legacy_mixed
  );
end;
$$;

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
  v_marker text;
  v_candidate_count integer := 0;
  v_marker_count integer := 0;
  v_legacy_mixed boolean := false;
  v_deposit_handled boolean := false;
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
  end if;

  v_rent_amount := case
    when v_legacy_mixed then greatest(coalesce(v_payment.amount_paid, 0) - v_deposit_amount, 0)
    else coalesce(v_payment.amount_paid, 0)
  end;
  v_total_amount := case
    when v_legacy_mixed then coalesce(v_payment.amount_paid, 0)
    else v_rent_amount + v_deposit_amount
  end;

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
      'depositDeleted', v_deposit_handled
    ),
    v_total_amount, '永久删除关联收款', true
  );

  return pg_catalog.jsonb_build_object(
    'action', 'delete',
    'paymentId', v_payment.id,
    'linkedDepositId', case when v_candidate_count = 1 then v_deposit.id else null end,
    'linkedDepositHandled', v_deposit_handled,
    'legacyMixedDeposit', v_legacy_mixed
  );
end;
$$;

alter function public.void_rent_payment_with_linked_deposit(uuid) owner to postgres;
alter function public.permanently_delete_rent_payment_with_linked_deposit(uuid) owner to postgres;

revoke all on function public.void_rent_payment_with_linked_deposit(uuid) from public, anon, authenticated, service_role;
revoke all on function public.permanently_delete_rent_payment_with_linked_deposit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_rent_payment_with_linked_deposit(uuid) to authenticated;
grant execute on function public.permanently_delete_rent_payment_with_linked_deposit(uuid) to authenticated;

commit;
