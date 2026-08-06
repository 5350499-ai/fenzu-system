-- Restore diagnostics only. This migration adds PostgreSQL LOG messages around
-- the existing Restore implementation without changing its data operations.

do $migration$
declare
  v_source text;
  v_original text;
  v_marker text;
begin
  select pg_get_functiondef(p.oid)
    into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'restore_workspace_backup_impl'
    and p.proargtypes = '2950 2950 3802'::oidvector;

  if v_source is null then
    raise exception 'restore_workspace_backup_impl was not found';
  end if;

  if position('restore_stage=impl_start' in v_source) = 0 then
    v_original := v_source;

    v_source := replace(v_source,
      'begin
  if not exists (',
      'begin
  raise log ''restore_stage=impl_start'';
  if not exists (');

    v_source := replace(v_source,
      '  -- Do not allow deletion of a Backup V1 row',
      '  raise log ''restore_stage=omitted_table_reference_checks_start'';

  -- Do not allow deletion of a Backup V1 row');
    v_source := replace(v_source,
      '  -- Included settlement snapshot rows may be replaced',
      '  raise log ''restore_stage=omitted_table_reference_checks_done'';

  -- Included settlement snapshot rows may be replaced');

    v_source := replace(v_source,
      '  delete from public.partner_settlement_transfer_snapshots t using public.partner_settlement_batches b',
      '  raise log ''restore_stage=delete_partner_settlement_transfer_snapshots_start'';
  delete from public.partner_settlement_transfer_snapshots t using public.partner_settlement_batches b');
    v_source := replace(v_source,
      '  delete from public.partner_settlement_segment_snapshots s using public.partner_settlement_batches b',
      '  raise log ''restore_stage=delete_partner_settlement_segment_snapshots_start'';
  delete from public.partner_settlement_segment_snapshots s using public.partner_settlement_batches b');
    v_source := replace(v_source,
      '  delete from public.partner_settlement_partner_snapshots s using public.partner_settlement_batches b',
      '  raise log ''restore_stage=delete_partner_settlement_partner_snapshots_start'';
  delete from public.partner_settlement_partner_snapshots s using public.partner_settlement_batches b');
    v_source := replace(v_source,
      '  delete from public.partner_settlement_batches where workspace_owner_id=p_workspace_owner_id;',
      '  delete from public.partner_settlement_batches where workspace_owner_id=p_workspace_owner_id;
  raise log ''restore_stage=delete_settlement_batches_done'';');

    v_source := replace(v_source,
      '  delete from public.partner_name_history h where h.workspace_owner_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_partner_name_history_start'';
  delete from public.partner_name_history h where h.workspace_owner_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.partner_property_shares s where s.workspace_owner_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_partner_property_shares_start'';
  delete from public.partner_property_shares s where s.workspace_owner_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.partners p where p.workspace_owner_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_partners_start'';
  delete from public.partners p where p.workspace_owner_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.tasks t where t.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_tasks_start'';
  delete from public.tasks t where t.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.viewing_appointments v where v.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_viewing_appointments_start'';
  delete from public.viewing_appointments v where v.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.deposits d where d.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_deposits_start'';
  delete from public.deposits d where d.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.expenses e where e.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_expenses_start'';
  delete from public.expenses e where e.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.rent_payments r where r.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_rent_payments_start'';
  delete from public.rent_payments r where r.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.contracts c where c.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_contracts_start'';
  delete from public.contracts c where c.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.tenants t where t.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_tenants_start'';
  delete from public.tenants t where t.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.rooms r where r.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_rooms_start'';
  delete from public.rooms r where r.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '  delete from public.properties p where p.user_id=p_workspace_owner_id',
      '  raise log ''restore_stage=delete_properties_start'';
  delete from public.properties p where p.user_id=p_workspace_owner_id');
    v_source := replace(v_source,
      '    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->''properties'',''[]''::jsonb)) x where (x->>''id'')::uuid=p.id);',
      '    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->''properties'',''[]''::jsonb)) x where (x->>''id'')::uuid=p.id);
  raise log ''restore_stage=delete_business_rows_done'';');

    v_source := replace(v_source,
      '  -- Parent-to-child upserts preserve IDs',
      '  raise log ''restore_stage=delete_phase_done'';

  -- Parent-to-child upserts preserve IDs');

    v_source := replace(v_source,
      '  insert into public.properties select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_properties_start'';
  insert into public.properties select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.rooms select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_rooms_start'';
  insert into public.rooms select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.tenants select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_tenants_start'';
  insert into public.tenants select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.contracts select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_contracts_start'';
  insert into public.contracts select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.rent_payments select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_rent_payments_start'';
  insert into public.rent_payments select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.expenses select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_expenses_start'';
  insert into public.expenses select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.deposits select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_deposits_start'';
  insert into public.deposits select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.viewing_appointments select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_viewing_appointments_start'';
  insert into public.viewing_appointments select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.tasks select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_tasks_start'';
  insert into public.tasks select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.partners select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_partners_start'';
  insert into public.partners select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.partner_property_shares select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_partner_property_shares_start'';
  insert into public.partner_property_shares select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.partner_name_history select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_partner_name_history_start'';
  insert into public.partner_name_history select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.partner_settlement_batches',
      '  raise log ''restore_stage=insert_settlement_batches_start'';
  insert into public.partner_settlement_batches');
    v_source := replace(v_source,
      '  insert into public.partner_settlement_partner_snapshots select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_partner_settlement_partner_snapshots_start'';
  insert into public.partner_settlement_partner_snapshots select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.partner_settlement_segment_snapshots select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_partner_settlement_segment_snapshots_start'';
  insert into public.partner_settlement_segment_snapshots select * from jsonb_populate_recordset');
    v_source := replace(v_source,
      '  insert into public.partner_settlement_transfer_snapshots select * from jsonb_populate_recordset',
      '  raise log ''restore_stage=insert_partner_settlement_transfer_snapshots_start'';
  insert into public.partner_settlement_transfer_snapshots select * from jsonb_populate_recordset');

    v_source := replace(v_source,
      '  -- Final boundary validation.',
      '  raise log ''restore_stage=import_phase_done'';

  -- Final boundary validation.');
    v_source := replace(v_source,
      '  if
    (select count(*)',
      '  raise log ''restore_stage=count_validation_start'';
  if
    (select count(*)');
    v_source := replace(v_source,
      '  -- Field-level validation before commit.',
      '  raise log ''restore_stage=count_validation_done'';

  -- Field-level validation before commit.');
    v_source := replace(v_source,
      '  if
    exists (select 1 from jsonb_array_elements',
      '  raise log ''restore_stage=field_validation_start'';
  if
    exists (select 1 from jsonb_array_elements');
    v_source := replace(v_source,
      '  insert into public.audit_logs (',
      '  raise log ''restore_stage=field_validation_done'';

  insert into public.audit_logs (');
    v_source := replace(v_source,
      '  values (''business'',p_actor_account_id,''restore_workspace_backup''',
      '  values (''business'',p_actor_account_id,''restore_workspace_backup''');

    foreach v_marker in array array[
      'restore_stage=impl_start',
      'restore_stage=omitted_table_reference_checks_start',
      'restore_stage=omitted_table_reference_checks_done',
      'restore_stage=delete_partner_settlement_transfer_snapshots_start',
      'restore_stage=delete_partner_settlement_segment_snapshots_start',
      'restore_stage=delete_partner_settlement_partner_snapshots_start',
      'restore_stage=delete_settlement_batches_done',
      'restore_stage=delete_partner_name_history_start',
      'restore_stage=delete_partner_property_shares_start',
      'restore_stage=delete_partners_start',
      'restore_stage=delete_tasks_start',
      'restore_stage=delete_viewing_appointments_start',
      'restore_stage=delete_deposits_start',
      'restore_stage=delete_expenses_start',
      'restore_stage=delete_rent_payments_start',
      'restore_stage=delete_contracts_start',
      'restore_stage=delete_tenants_start',
      'restore_stage=delete_rooms_start',
      'restore_stage=delete_properties_start',
      'restore_stage=delete_business_rows_done',
      'restore_stage=delete_phase_done',
      'restore_stage=insert_properties_start',
      'restore_stage=insert_rooms_start',
      'restore_stage=insert_tenants_start',
      'restore_stage=insert_contracts_start',
      'restore_stage=insert_rent_payments_start',
      'restore_stage=insert_expenses_start',
      'restore_stage=insert_deposits_start',
      'restore_stage=insert_viewing_appointments_start',
      'restore_stage=insert_tasks_start',
      'restore_stage=insert_partners_start',
      'restore_stage=insert_partner_property_shares_start',
      'restore_stage=insert_partner_name_history_start',
      'restore_stage=insert_settlement_batches_start',
      'restore_stage=insert_partner_settlement_partner_snapshots_start',
      'restore_stage=insert_partner_settlement_segment_snapshots_start',
      'restore_stage=insert_partner_settlement_transfer_snapshots_start',
      'restore_stage=import_phase_done',
      'restore_stage=count_validation_start',
      'restore_stage=count_validation_done',
      'restore_stage=field_validation_start',
      'restore_stage=field_validation_done'
    ] loop
      if position(v_marker in v_source) = 0 then
        raise exception 'Restore diagnostic marker was not inserted: %', v_marker;
      end if;
    end loop;

    if v_source = v_original then
      raise exception 'No Restore stage markers were inserted';
    end if;

    execute v_source;
  end if;
end;
$migration$;

create or replace function public.restore_workspace_backup(
  p_workspace_owner_id uuid,
  p_actor_account_id uuid,
  p_data jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise log 'restore_stage=wrapper_start';
  if not exists (
    select 1 from public.user_profiles
    where auth_user_id = p_actor_account_id
      and workspace_owner_id = p_workspace_owner_id
      and account_type = 'owner'
      and status = 'active'
  ) then
    raise exception 'Only an active workspace owner may restore a backup' using errcode = '42501';
  end if;

  perform set_config('app.restore_mode', 'on', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise log 'restore_stage=wrapper_impl_start';
  perform public.restore_workspace_backup_impl(p_workspace_owner_id, p_actor_account_id, p_data);
  raise log 'restore_stage=wrapper_impl_return';
end;
$$;

revoke all on function public.restore_workspace_backup(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup(uuid, uuid, jsonb) to service_role;
