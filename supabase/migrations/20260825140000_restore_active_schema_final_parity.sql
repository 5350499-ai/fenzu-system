-- Final isolated-acceptance parity patch.  The Production live schema has no
-- tasks.completed_at column; remove the stale EXCLUDED assignment from the
-- active Restore implementation without changing the 18-table boundary.

do $migration$
declare
  v_source text;
  v_marker text := ', completed_at=excluded.completed_at';
begin
  select pg_get_functiondef(
    'public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure
  ) into v_source;

  if v_source is null then
    raise exception 'restore_workspace_backup_impl was not found';
  end if;

  if position(v_marker in v_source) = 0 then
    raise exception 'Restore tasks.completed_at mapping marker not found';
  end if;

  v_source := replace(v_source, v_marker, '');

  if position(v_marker in v_source) > 0 then
    raise exception 'Restore tasks.completed_at mapping remains after replacement';
  end if;

  execute v_source;
end;
$migration$;
