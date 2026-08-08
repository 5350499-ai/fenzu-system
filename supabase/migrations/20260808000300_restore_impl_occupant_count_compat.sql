begin;

-- Restore V4 is implemented behind restore_workspace_backup_impl. Extend that
-- reviewed implementation in place so old payloads receive the database
-- default without changing the public wrapper or restore boundary.
do $$
declare
  v_function text;
begin
  select pg_get_functiondef(p.oid)
    into v_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'restore_workspace_backup_impl'
    and p.proargtypes = '2950 2950 3802'::oidvector;

  if v_function is null then
    raise exception 'restore_workspace_backup_impl was not found';
  end if;

  v_function := replace(
    v_function,
    E'begin\n  raise log ''restore_stage=impl_start'';\n  if not exists (',
    E'begin\n  raise log ''restore_stage=impl_start'';\n  p_data := jsonb_set(\n    p_data,\n    ''{tenants}'',\n    coalesce((select jsonb_agg(jsonb_set(x, ''{occupant_count}'', coalesce(x->''occupant_count'', ''1''::jsonb), true))\n      from jsonb_array_elements(coalesce(p_data->''tenants'', ''[]''::jsonb)) x), ''[]''::jsonb),\n    true\n  );\n  if not exists ('
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
