-- Restore diagnostics: use a PostgreSQL-compatible JSON object key count.

do $migration$
declare
  v_source text;
begin
  select p.prosrc
    into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname = 'restore_first_json_mismatch'
    and p.proargtypes = '25 25 2950 3802'::oidvector;

  if v_source is null then
    raise exception 'restore_first_json_mismatch was not found';
  end if;

  v_source := replace(
    v_source,
    'jsonb_object_length(v_expected)',
    '(select count(*) from jsonb_object_keys(v_expected))'
  );
  v_source := replace(
    v_source,
    'jsonb_object_length(v_actual)',
    '(select count(*) from jsonb_object_keys(v_actual))'
  );

  execute format(
    'create or replace function app_private.restore_first_json_mismatch(p_table text, p_json_key text, p_workspace_owner_id uuid, p_data jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as %L',
    v_source
  );
end;
$migration$;

