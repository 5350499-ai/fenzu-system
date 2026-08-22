-- Restore mapping closure after current live-schema additions.
-- The existing Restore V4 engine remains canonical; this migration only
-- extends its existing-row conflict updates and preserves workspace currency.

do $migration$
declare
  v_source text;
  v_marker text;
  v_replacement text;
begin
  select pg_get_functiondef('public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure)
    into v_source;
  if v_source is null then
    raise exception 'restore_workspace_backup_impl was not found';
  end if;

  v_marker := 'landlord_name=excluded.landlord_name, name=excluded.name, address=excluded.address, city=excluded.city, property_type=excluded.property_type, sublet_allowed=excluded.sublet_allowed, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, occupancy_tracking_start_date=excluded.occupancy_tracking_start_date;';
  v_replacement := 'landlord_id=excluded.landlord_id, landlord_name=excluded.landlord_name, name=excluded.name, address=excluded.address, city=excluded.city, property_type=excluded.property_type, sublet_allowed=excluded.sublet_allowed, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, occupancy_tracking_start_date=excluded.occupancy_tracking_start_date;';
  if position(v_marker in v_source) = 0 then raise exception 'Restore mapping marker not found: properties'; end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'property_id=excluded.property_id, name=excluded.name, room_number=excluded.room_number, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;';
  v_replacement := 'property_id=excluded.property_id, name=excluded.name, room_number=excluded.room_number, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, status=excluded.status, area=excluded.area, has_window=excluded.has_window, has_private_bathroom=excluded.has_private_bathroom, furniture=excluded.furniture, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;';
  if position(v_marker in v_source) = 0 then raise exception 'Restore mapping marker not found: rooms'; end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'property_id=excluded.property_id, room_id=excluded.room_id, name=excluded.name, phone=excluded.phone, email=excluded.email, wechat=excluded.wechat, source=excluded.source, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, occupant_count=excluded.occupant_count, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, payment_day=excluded.payment_day, actual_move_out_date=excluded.actual_move_out_date;';
  v_replacement := 'property_id=excluded.property_id, room_id=excluded.room_id, name=excluded.name, phone=excluded.phone, email=excluded.email, wechat=excluded.wechat, whatsapp=excluded.whatsapp, passport_number=excluded.passport_number, nie_number=excluded.nie_number, nationality=excluded.nationality, source=excluded.source, move_in_date=excluded.move_in_date, expected_move_out_date=excluded.expected_move_out_date, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, key_count=excluded.key_count, occupant_count=excluded.occupant_count, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, payment_day=excluded.payment_day, actual_move_out_date=excluded.actual_move_out_date;';
  if position(v_marker in v_source) = 0 then raise exception 'Restore mapping marker not found: tenants'; end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'property_id=excluded.property_id, room_id=excluded.room_id, tenant_id=excluded.tenant_id, start_date=excluded.start_date, end_date=excluded.end_date, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;';
  v_replacement := 'property_id=excluded.property_id, contract_type=excluded.contract_type, room_id=excluded.room_id, tenant_id=excluded.tenant_id, landlord_id=excluded.landlord_id, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, start_date=excluded.start_date, end_date=excluded.end_date, is_signed=excluded.is_signed, is_active=excluded.is_active, status=excluded.status, file_url=excluded.file_url, storage_path=excluded.storage_path, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;';
  if position(v_marker in v_source) = 0 then raise exception 'Restore mapping marker not found: contracts'; end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'property_id=excluded.property_id, room_id=excluded.room_id, rent_month=excluded.rent_month, amount_due=excluded.amount_due, amount_paid=excluded.amount_paid, amount_unpaid=excluded.amount_unpaid, payment_date=excluded.payment_date, payment_method=excluded.payment_method, is_overdue=excluded.is_overdue, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, received_by=excluded.received_by, coverage_start_date=excluded.coverage_start_date, coverage_end_date=excluded.coverage_end_date, payment_status=excluded.payment_status, income_type=excluded.income_type, income_item=excluded.income_item;';
  v_replacement := 'property_id=excluded.property_id, room_id=excluded.room_id, rent_month=excluded.rent_month, amount_due=excluded.amount_due, amount_paid=excluded.amount_paid, amount_unpaid=excluded.amount_unpaid, payment_date=excluded.payment_date, payment_method=excluded.payment_method, is_overdue=excluded.is_overdue, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, received_by=excluded.received_by, coverage_start_date=excluded.coverage_start_date, coverage_end_date=excluded.coverage_end_date, payment_status=excluded.payment_status, income_type=excluded.income_type, income_item=excluded.income_item, client_request_id=excluded.client_request_id;';
  if position(v_marker in v_source) = 0 then raise exception 'Restore mapping marker not found: rent_payments'; end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'property_id=excluded.property_id, room_id=excluded.room_id, tenant_id=excluded.tenant_id, contract_id=excluded.contract_id, rent_payment_id=excluded.rent_payment_id, deposit_id=excluded.deposit_id, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;';
  v_replacement := 'property_id=excluded.property_id, room_id=excluded.room_id, tenant_id=excluded.tenant_id, contract_id=excluded.contract_id, rent_payment_id=excluded.rent_payment_id, deposit_id=excluded.deposit_id, completed_at=excluded.completed_at, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;';
  if position(v_marker in v_source) = 0 then raise exception 'Restore mapping marker not found: tasks'; end if;
  v_source := replace(v_source, v_marker, v_replacement);

  execute v_source;

  select pg_get_functiondef('public.restore_workspace_backup(uuid,uuid,jsonb)'::regprocedure)
    into v_source;
  if v_source is null then raise exception 'restore_workspace_backup was not found'; end if;
  v_marker := 'perform public.restore_workspace_backup_impl(p_workspace_owner_id, p_actor_account_id, p_data);';
  v_replacement := v_marker || E'\n\n  update public.user_profiles\n  set currency_code = upper(p_data->''settings''->>''currencyCode'')\n  where auth_user_id = p_workspace_owner_id\n    and upper(p_data->''settings''->>''currencyCode'') in (''EUR'', ''USD'', ''GBP'', ''CNY'', ''JPY'');';
  if position(v_marker in v_source) = 0 then raise exception 'Restore currency marker not found'; end if;
  v_source := replace(v_source, v_marker, v_replacement);
  execute v_source;
end;
$migration$;
