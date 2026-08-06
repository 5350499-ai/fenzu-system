-- Restore V4: expose the first field-level mismatch without changing the
-- restore operation, comparison rules, or transaction behavior.

create or replace function app_private.restore_first_json_mismatch(
  p_table text,
  p_json_key text,
  p_workspace_owner_id uuid,
  p_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected jsonb;
  v_actual jsonb;
  v_id text;
  v_field text;
  v_difference text;
begin
  if p_table not in (
    'properties', 'rooms', 'tenants', 'contracts', 'rent_payments',
    'expenses', 'deposits', 'viewing_appointments', 'tasks', 'partners',
    'partner_property_shares', 'partner_name_history',
    'partner_settlement_batches', 'partner_settlement_partner_snapshots',
    'partner_settlement_segment_snapshots',
    'partner_settlement_transfer_snapshots'
  ) then
    raise exception 'Unsupported restore validation table: %', p_table
      using errcode = '22023';
  end if;

  for v_expected in
    select value
    from jsonb_array_elements(coalesce(p_data -> p_json_key, '[]'::jsonb))
  loop
    v_id := v_expected ->> 'id';
    v_actual := null;

    if p_table in (
      'properties', 'rooms', 'tenants', 'contracts', 'rent_payments',
      'expenses', 'deposits', 'viewing_appointments', 'tasks'
    ) then
      execute format(
        'select to_jsonb(t) from public.%I t where t.id = $1::uuid and t.user_id = $2::uuid',
        p_table
      ) into v_actual using v_id::uuid, p_workspace_owner_id;
    elsif p_table in (
      'partners', 'partner_property_shares', 'partner_name_history',
      'partner_settlement_batches'
    ) then
      execute format(
        'select to_jsonb(t) from public.%I t where t.id = $1::uuid and t.workspace_owner_id = $2::uuid',
        p_table
      ) into v_actual using v_id::uuid, p_workspace_owner_id;
    else
      execute format(
        'select to_jsonb(t) from public.%I t where t.id = $1::uuid',
        p_table
      ) into v_actual using v_id::uuid;
    end if;

    if v_actual is null then
      return jsonb_build_object(
        'table', p_table,
        'recordId', v_id,
        'field', '__record__',
        'backupValue', v_expected,
        'restoredValue', null,
        'difference', 'record_missing_after_restore',
        'backupFieldCount', jsonb_object_length(v_expected),
        'restoredFieldCount', 0
      );
    end if;

    if p_table in (
      'properties', 'rooms', 'tenants', 'contracts', 'rent_payments',
      'expenses', 'deposits', 'viewing_appointments', 'tasks', 'partners',
      'partner_property_shares'
    ) then
      v_expected := v_expected - 'created_at' - 'updated_at';
      v_actual := v_actual - 'created_at' - 'updated_at';
    elsif p_table = 'partner_name_history' then
      v_expected := v_expected - 'created_at';
      v_actual := v_actual - 'created_at';
    elsif p_table = 'partner_settlement_batches' then
      v_expected := v_expected - 'period_range' - 'created_at' - 'updated_at';
      v_actual := v_actual - 'period_range' - 'created_at' - 'updated_at';
    else
      v_expected := v_expected - 'created_at';
      v_actual := v_actual - 'created_at';
    end if;

    if v_expected is distinct from v_actual then
      for v_field in
        select key
        from jsonb_object_keys(v_expected || v_actual) as keys(key)
        order by key
      loop
        if (v_expected -> v_field) is distinct from (v_actual -> v_field) then
          v_difference := case
            when (v_expected -> v_field) is null and (v_actual -> v_field) is not null
              then 'backup_field_missing_or_null_restore_value'
            when (v_expected -> v_field) is not null and (v_actual -> v_field) is null
              then 'backup_value_restore_field_missing_or_null'
            when (v_expected ->> v_field) = '' and (v_actual -> v_field) = 'null'::jsonb
              then 'backup_empty_string_restore_null'
            when (v_expected -> v_field) = 'null'::jsonb and (v_actual ->> v_field) = ''
              then 'backup_null_restore_empty_string'
            when v_field ilike '%date%' or v_field ilike '%time%' or v_field in ('effective_from', 'effective_to')
              then 'date_or_time_value_difference'
            else 'value_difference'
          end;

          return jsonb_build_object(
            'table', p_table,
            'recordId', v_id,
            'field', v_field,
            'backupValue', v_expected -> v_field,
            'restoredValue', v_actual -> v_field,
            'difference', v_difference,
            'backupFieldCount', jsonb_object_length(v_expected),
            'restoredFieldCount', jsonb_object_length(v_actual)
          );
        end if;
      end loop;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function app_private.restore_first_json_mismatch(text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

do $migration$
declare
  v_source text;
  v_old_raise constant text := $old$raise exception 'Restore validation failed: restored fields do not match the Backup V1 payload' using errcode = '23514';$old$;
  v_new_raise constant text := $new$
    select coalesce(
      app_private.restore_first_json_mismatch('properties', 'properties', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('rooms', 'rooms', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('tenants', 'tenants', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('contracts', 'contracts', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('rent_payments', 'rentPayments', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('expenses', 'expenses', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('deposits', 'deposits', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('viewing_appointments', 'viewingAppointments', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('tasks', 'tasks', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partners', 'partners', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partner_property_shares', 'partnerShares', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partner_name_history', 'partnerNameHistory', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partner_settlement_batches', 'settlementBatches', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partner_settlement_partner_snapshots', 'settlementPartnerSnapshots', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partner_settlement_segment_snapshots', 'settlementSegmentSnapshots', p_workspace_owner_id, p_data),
      app_private.restore_first_json_mismatch('partner_settlement_transfer_snapshots', 'settlementTransferSnapshots', p_workspace_owner_id, p_data)
    ) into v_mismatch;

    if v_mismatch is not null then
      raise exception 'Restore validation failed: restored fields do not match the Backup V1 payload'
        using errcode = '23514',
              detail = v_mismatch::text,
              hint = 'First mismatch only; the transaction will be rolled back.',
              schema = 'public',
              table = v_mismatch ->> 'table',
              column = v_mismatch ->> 'field';
    end if;$new$;
begin
  select p.prosrc
    into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'restore_workspace_backup_impl'
    and p.proargtypes = '2950 2950 3802'::oidvector;

  if v_source is null then
    raise exception 'restore_workspace_backup_impl was not found';
  end if;

  v_source := replace(v_source, 'incoming_ids uuid[];', E'incoming_ids uuid[];\n  v_mismatch jsonb;');
  if position(v_old_raise in v_source) = 0 then
    raise exception 'Restore validation block was not replaced';
  end if;
  v_source := replace(v_source, v_old_raise, v_new_raise);

  execute format(
    'create or replace function public.restore_workspace_backup_impl(p_workspace_owner_id uuid, p_actor_account_id uuid, p_data jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as %L',
    v_source
  );
end;
$migration$;
