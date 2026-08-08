begin;

-- Keep Restore V4 itself as the restore boundary. Old Backup V1 payloads did
-- not contain occupant_count, so normalize that one missing field to 1 before
-- the existing jsonb_populate_recordset and field-level validation run.
do $$
declare
  v_function text;
begin
  select pg_get_functiondef('public.restore_workspace_backup(uuid,uuid,jsonb)'::regprocedure)
    into v_function;

  v_function := replace(
    v_function,
    E'begin\n  if not exists (',
    E'begin\n  p_data := jsonb_set(\n    p_data,\n    ''{tenants}'',\n    coalesce((select jsonb_agg(jsonb_set(x, ''{occupant_count}'', coalesce(x->''occupant_count'', ''1''::jsonb), true))\n      from jsonb_array_elements(coalesce(p_data->''tenants'', ''[]''::jsonb)) x), ''[]''::jsonb),\n    true\n  );\n\n  if not exists ('
  );

  v_function := replace(
    v_function,
    'deposit_amount=excluded.deposit_amount, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, payment_day=excluded.payment_day, actual_move_out_date=excluded.actual_move_out_date;',
    'deposit_amount=excluded.deposit_amount, occupant_count=excluded.occupant_count, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, payment_day=excluded.payment_day, actual_move_out_date=excluded.actual_move_out_date;'
  );

  execute v_function;
end;
$$;

commit;
