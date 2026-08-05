-- Preserve the dry-run rollback contract while returning PostgreSQL diagnostics.
create or replace function public.restore_workspace_backup_dry_run(
  p_workspace_owner_id uuid,
  p_actor_account_id uuid,
  p_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
  v_table text;
  v_column text;
  v_constraint text;
  v_schema text;
  v_datatype text;
begin
  begin
    perform public.restore_workspace_backup(
      p_workspace_owner_id,
      p_actor_account_id,
      p_data
    );
    raise exception using errcode = 'P0001', message = '__RESTORE_DRY_RUN_ROLLBACK__';
  exception when others then
    get stacked diagnostics
      v_message = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint,
      v_context = pg_exception_context,
      v_table = table_name,
      v_column = column_name,
      v_constraint = constraint_name,
      v_schema = schema_name,
      v_datatype = pg_datatype_name;
    v_sqlstate := SQLSTATE;

    if v_sqlstate = 'P0001' and v_message = '__RESTORE_DRY_RUN_ROLLBACK__' then
      return jsonb_build_object(
        'ok', true,
        'delete', jsonb_build_object('success', true),
        'import', jsonb_build_object('success', true),
        'fieldValidation', jsonb_build_object('success', true),
        'consistencyValidation', jsonb_build_object('success', true),
        'transactionRolledBack', true,
        'databaseUnchanged', true
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'transactionRolledBack', true,
      'databaseUnchanged', true,
      'errorCode', v_sqlstate,
      'error', coalesce(v_message, ''),
      'details', coalesce(v_detail, ''),
      'hint', coalesce(v_hint, ''),
      'context', coalesce(v_context, ''),
      'table', coalesce(v_table, ''),
      'column', coalesce(v_column, ''),
      'constraint', coalesce(v_constraint, ''),
      'schema', coalesce(v_schema, ''),
      'datatype', coalesce(v_datatype, ''),
      'failureStage', 'restore_transaction'
    );
  end;
end;
$$;

revoke all on function public.restore_workspace_backup_dry_run(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup_dry_run(uuid, uuid, jsonb) to service_role;
