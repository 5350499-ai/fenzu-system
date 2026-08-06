-- Restore V4: use the live PostgreSQL table schema as the single source of
-- truth for export/restore/validation field sets. Unknown legacy Backup V1
-- keys remain in the file but are ignored by jsonb_populate_recordset and by
-- the field comparison because the current table does not contain them.

do $migration$
declare
  v_source text;
  v_marker constant text := $marker$    if v_expected is distinct from v_actual then$marker$;
  v_replacement constant text := $replacement$
    -- Project the expected object onto the keys that PostgreSQL actually
    -- returned for the live table. The table schema, not a duplicated app
    -- whitelist, defines the comparison boundary.
    v_expected := (
      select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      from jsonb_each(v_expected) as entry(key, value)
      where v_actual ? entry.key
    );

    if v_expected is distinct from v_actual then$replacement$;
begin
  select pg_get_functiondef(p.oid)
    into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname = 'restore_first_json_mismatch'
    and p.proargtypes = '25 25 2950 3802'::oidvector;

  if v_source is null then
    raise exception 'restore_first_json_mismatch was not found';
  end if;

  if position(v_marker in v_source) = 0 then
    raise exception 'restore_first_json_mismatch validation marker was not found';
  end if;

  v_source := replace(v_source, v_marker, v_replacement);
  execute v_source;
end;
$migration$;
