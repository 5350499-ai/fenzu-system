-- Restore live-schema parity patch.
-- Removes stale EXCLUDED assignments from the active implementation only.

do $migration$
declare
  v_source text;
  v_before text;
  v_marker text;
  v_prohibited text[] := array[
    'landlord_id=excluded.landlord_id','area=excluded.area','has_window=excluded.has_window',
    'has_private_bathroom=excluded.has_private_bathroom','furniture=excluded.furniture',
    'whatsapp=excluded.whatsapp','passport_number=excluded.passport_number','nie_number=excluded.nie_number',
    'nationality=excluded.nationality','move_in_date=excluded.move_in_date',
    'expected_move_out_date=excluded.expected_move_out_date','key_count=excluded.key_count',
    'contract_type=excluded.contract_type','is_signed=excluded.is_signed',
    'file_url=excluded.file_url','storage_path=excluded.storage_path'
  ];
begin
  select pg_get_functiondef('public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure)
    into v_source;
  if v_source is null then raise exception 'restore_workspace_backup_impl was not found'; end if;

  foreach v_marker in array array[
    'landlord_id=excluded.landlord_id',
    'area=excluded.area, has_window=excluded.has_window, has_private_bathroom=excluded.has_private_bathroom, furniture=excluded.furniture',
    'whatsapp=excluded.whatsapp, passport_number=excluded.passport_number, nie_number=excluded.nie_number, nationality=excluded.nationality',
    'move_in_date=excluded.move_in_date, expected_move_out_date=excluded.expected_move_out_date',
    'key_count=excluded.key_count','contract_type=excluded.contract_type',
    'is_signed=excluded.is_signed, is_active=excluded.is_active',
    'file_url=excluded.file_url, storage_path=excluded.storage_path'
  ] loop
    if position(v_marker in v_source) = 0 then
      raise exception 'Restore live-schema parity marker not found: %', v_marker;
    end if;
  end loop;

  v_before := v_source;
  v_source := replace(v_source, ', landlord_id=excluded.landlord_id', '');
  v_source := replace(v_source, ', area=excluded.area, has_window=excluded.has_window, has_private_bathroom=excluded.has_private_bathroom, furniture=excluded.furniture', '');
  v_source := replace(v_source, ', whatsapp=excluded.whatsapp, passport_number=excluded.passport_number, nie_number=excluded.nie_number, nationality=excluded.nationality', '');
  v_source := replace(v_source, ', move_in_date=excluded.move_in_date, expected_move_out_date=excluded.expected_move_out_date', '');
  v_source := replace(v_source, ', key_count=excluded.key_count', '');
  v_source := replace(v_source, ', contract_type=excluded.contract_type', '');
  v_source := replace(v_source, ', is_signed=excluded.is_signed, is_active=excluded.is_active', '');
  v_source := replace(v_source, ', file_url=excluded.file_url, storage_path=excluded.storage_path', '');

  foreach v_marker in array v_prohibited loop
    if position(v_marker in v_source) > 0 then
      raise exception 'Restore live-schema parity replacement left prohibited reference: %', v_marker;
    end if;
  end loop;
  if v_source = v_before then raise exception 'Restore live-schema parity replacement made no change'; end if;
  execute v_source;
end;
$migration$;
