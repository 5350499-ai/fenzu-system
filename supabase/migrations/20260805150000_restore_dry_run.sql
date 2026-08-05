-- Restore Dry Run: execute the existing Backup V1 restore transaction and
-- deliberately roll it back. No data or audit row survives this function.
create or replace function public.restore_workspace_backup_dry_run(
  p_workspace_owner_id uuid,
  p_actor_account_id uuid,
  p_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.restore_workspace_backup(
      p_workspace_owner_id,
      p_actor_account_id,
      p_data
    );
    raise exception using errcode = 'P0001', message = '__RESTORE_DRY_RUN_ROLLBACK__';
  exception when others then
    if SQLSTATE = 'P0001' and SQLERRM = '__RESTORE_DRY_RUN_ROLLBACK__' then
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
      'errorCode', SQLSTATE,
      'error', SQLERRM
    );
  end;
end;
$$;

revoke all on function public.restore_workspace_backup_dry_run(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup_dry_run(uuid, uuid, jsonb) to service_role;
