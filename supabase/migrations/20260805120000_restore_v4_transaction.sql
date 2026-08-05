-- Restore V4: atomic replacement of the Backup V1 business-table boundary.
-- Tables not represented by Backup V1 are never deleted or updated.

create or replace function public.restore_workspace_backup(
  p_workspace_owner_id uuid,
  p_actor_account_id uuid,
  p_data jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  incoming_ids uuid[];
begin
  if not exists (
    select 1 from public.user_profiles
    where auth_user_id = p_actor_account_id
      and workspace_owner_id = p_workspace_owner_id
      and account_type = 'owner'
      and status = 'active'
  ) then
    raise exception 'Only an active workspace owner may restore a backup' using errcode = '42501';
  end if;

  -- Do not allow deletion of a Backup V1 row when an omitted table would be
  -- deleted, nulled, or left with a broken reference. These checks happen
  -- before any write, inside the same transaction as the restore.
  if exists (
    select 1 from public.properties p
    where p.user_id = p_workspace_owner_id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'properties','[]'::jsonb)) x where (x->>'id')::uuid = p.id)
      and (
        exists (select 1 from public.user_property_access a where a.property_id = p.id)
        or exists (select 1 from public.tenant_notes n where n.property_id = p.id)
      )
  ) then
    raise exception 'Restore blocked: omitted tables still reference a property that would be removed' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.rooms r
    where r.user_id = p_workspace_owner_id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'rooms','[]'::jsonb)) x where (x->>'id')::uuid = r.id)
      and (
        exists (select 1 from public.tenant_notes n where n.room_id = r.id)
      )
  ) then
    raise exception 'Restore blocked: omitted tables still reference a room that would be removed' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.tenants t
    where t.user_id = p_workspace_owner_id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'tenants','[]'::jsonb)) x where (x->>'id')::uuid = t.id)
      and (
        exists (select 1 from public.tenant_notes n where n.tenant_id = t.id)
        or exists (select 1 from public.contract_files f where f.tenant_id = t.id)
        or exists (select 1 from public.check_in_requests c where c.tenant_id = t.id)
      )
  ) then
    raise exception 'Restore blocked: omitted tables still reference a tenant that would be removed' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.contracts c
    where c.user_id = p_workspace_owner_id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'contracts','[]'::jsonb)) x where (x->>'id')::uuid = c.id)
      and (
        exists (select 1 from public.contract_files f where f.contract_id = c.id)
        or exists (select 1 from public.check_in_requests r where r.contract_id = c.id)
      )
  ) then
    raise exception 'Restore blocked: omitted tables still reference a contract that would be removed' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.expenses e
    where e.user_id = p_workspace_owner_id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'expenses','[]'::jsonb)) x where (x->>'id')::uuid = e.id)
      and exists (select 1 from public.expense_files f where f.expense_id = e.id)
  ) then
    raise exception 'Restore blocked: omitted attachment records reference an expense that would be removed' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.rent_payments r
    where r.user_id = p_workspace_owner_id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'rentPayments','[]'::jsonb)) x where (x->>'id')::uuid = r.id)
      and (
        exists (select 1 from public.rent_payment_files f where f.rent_payment_id = r.id)
        or exists (select 1 from public.check_in_requests c where c.rent_payment_id = r.id)
      )
  ) then
    raise exception 'Restore blocked: omitted tables still reference a rent payment that would be removed' using errcode = '23503';
  end if;

  -- Included settlement snapshot rows may be replaced because all of their
  -- dependent tables are themselves part of Backup V1.
  delete from public.partner_settlement_transfer_snapshots t using public.partner_settlement_batches b
    where b.id=t.settlement_batch_id and b.workspace_owner_id=p_workspace_owner_id;
  delete from public.partner_settlement_segment_snapshots s using public.partner_settlement_batches b
    where b.id=s.settlement_batch_id and b.workspace_owner_id=p_workspace_owner_id;
  delete from public.partner_settlement_partner_snapshots s using public.partner_settlement_batches b
    where b.id=s.settlement_batch_id and b.workspace_owner_id=p_workspace_owner_id;
  delete from public.partner_settlement_batches where workspace_owner_id=p_workspace_owner_id;

  delete from public.partner_name_history h where h.workspace_owner_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'partnerNameHistory','[]'::jsonb)) x where (x->>'id')::uuid=h.id);
  delete from public.partner_property_shares s where s.workspace_owner_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'partnerShares','[]'::jsonb)) x where (x->>'id')::uuid=s.id);
  delete from public.partners p where p.workspace_owner_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'partners','[]'::jsonb)) x where (x->>'id')::uuid=p.id);
  delete from public.tasks t where t.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'tasks','[]'::jsonb)) x where (x->>'id')::uuid=t.id);
  delete from public.viewing_appointments v where v.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'viewingAppointments','[]'::jsonb)) x where (x->>'id')::uuid=v.id);
  delete from public.deposits d where d.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'deposits','[]'::jsonb)) x where (x->>'id')::uuid=d.id);
  delete from public.expenses e where e.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'expenses','[]'::jsonb)) x where (x->>'id')::uuid=e.id);
  delete from public.rent_payments r where r.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'rentPayments','[]'::jsonb)) x where (x->>'id')::uuid=r.id);
  delete from public.contracts c where c.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'contracts','[]'::jsonb)) x where (x->>'id')::uuid=c.id);
  delete from public.tenants t where t.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'tenants','[]'::jsonb)) x where (x->>'id')::uuid=t.id);
  delete from public.rooms r where r.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'rooms','[]'::jsonb)) x where (x->>'id')::uuid=r.id);
  delete from public.properties p where p.user_id=p_workspace_owner_id
    and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'properties','[]'::jsonb)) x where (x->>'id')::uuid=p.id);

  -- Parent-to-child upserts preserve IDs referenced by omitted tables while
  -- making the included Backup V1 boundary match the uploaded file.
  insert into public.properties select * from jsonb_populate_recordset(null::public.properties, coalesce(p_data->'properties','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, landlord_name=excluded.landlord_name, name=excluded.name, address=excluded.address, city=excluded.city, property_type=excluded.property_type, sublet_allowed=excluded.sublet_allowed, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, occupancy_tracking_start_date=excluded.occupancy_tracking_start_date;
  insert into public.rooms select * from jsonb_populate_recordset(null::public.rooms, coalesce(p_data->'rooms','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, property_id=excluded.property_id, name=excluded.name, room_number=excluded.room_number, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;
  insert into public.tenants select * from jsonb_populate_recordset(null::public.tenants, coalesce(p_data->'tenants','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, property_id=excluded.property_id, room_id=excluded.room_id, name=excluded.name, phone=excluded.phone, email=excluded.email, wechat=excluded.wechat, source=excluded.source, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, payment_day=excluded.payment_day, actual_move_out_date=excluded.actual_move_out_date;
  insert into public.contracts select * from jsonb_populate_recordset(null::public.contracts, coalesce(p_data->'contracts','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, property_id=excluded.property_id, room_id=excluded.room_id, tenant_id=excluded.tenant_id, start_date=excluded.start_date, end_date=excluded.end_date, monthly_rent=excluded.monthly_rent, deposit_amount=excluded.deposit_amount, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;
  insert into public.rent_payments select * from jsonb_populate_recordset(null::public.rent_payments, coalesce(p_data->'rentPayments','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, tenant_id=excluded.tenant_id, property_id=excluded.property_id, room_id=excluded.room_id, rent_month=excluded.rent_month, amount_due=excluded.amount_due, amount_paid=excluded.amount_paid, amount_unpaid=excluded.amount_unpaid, payment_date=excluded.payment_date, payment_method=excluded.payment_method, is_overdue=excluded.is_overdue, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, received_by=excluded.received_by, coverage_start_date=excluded.coverage_start_date, coverage_end_date=excluded.coverage_end_date, payment_status=excluded.payment_status, income_type=excluded.income_type, income_item=excluded.income_item;
  insert into public.expenses select * from jsonb_populate_recordset(null::public.expenses, coalesce(p_data->'expenses','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, property_id=excluded.property_id, expense_month=excluded.expense_month, category=excluded.category, amount=excluded.amount, payment_date=excluded.payment_date, is_paid=excluded.is_paid, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, room_id=excluded.room_id, payment_method=excluded.payment_method, paid_by=excluded.paid_by;
  insert into public.deposits select * from jsonb_populate_recordset(null::public.deposits, coalesce(p_data->'deposits','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, tenant_id=excluded.tenant_id, property_id=excluded.property_id, room_id=excluded.room_id, transaction_type=excluded.transaction_type, amount=excluded.amount, transaction_date=excluded.transaction_date, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at, received_by=excluded.received_by, paid_by=excluded.paid_by;
  insert into public.viewing_appointments select * from jsonb_populate_recordset(null::public.viewing_appointments, coalesce(p_data->'viewingAppointments','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, property_id=excluded.property_id, room_id=excluded.room_id, appointment_date=excluded.appointment_date, appointment_time=excluded.appointment_time, contact_name=excluded.contact_name, contact_whatsapp=excluded.contact_whatsapp, contact_phone=excluded.contact_phone, status=excluded.status, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;
  insert into public.tasks select * from jsonb_populate_recordset(null::public.tasks, coalesce(p_data->'tasks','[]'::jsonb))
    on conflict (id) do update set user_id=excluded.user_id, task_type=excluded.task_type, title=excluded.title, description=excluded.description, due_date=excluded.due_date, status=excluded.status, priority=excluded.priority, property_id=excluded.property_id, room_id=excluded.room_id, tenant_id=excluded.tenant_id, contract_id=excluded.contract_id, rent_payment_id=excluded.rent_payment_id, deposit_id=excluded.deposit_id, notes=excluded.notes, created_at=excluded.created_at, updated_at=excluded.updated_at;
  insert into public.partners select * from jsonb_populate_recordset(null::public.partners, coalesce(p_data->'partners','[]'::jsonb))
    on conflict (id) do update set workspace_owner_id=excluded.workspace_owner_id, legacy_code=excluded.legacy_code, display_name=excluded.display_name, color_key=excluded.color_key, sort_order=excluded.sort_order, is_active=excluded.is_active, linked_account_id=excluded.linked_account_id, created_at=excluded.created_at, updated_at=excluded.updated_at;
  insert into public.partner_property_shares select * from jsonb_populate_recordset(null::public.partner_property_shares, coalesce(p_data->'partnerShares','[]'::jsonb))
    on conflict (id) do update set workspace_owner_id=excluded.workspace_owner_id, property_id=excluded.property_id, partner_id=excluded.partner_id, percentage=excluded.percentage, effective_from=excluded.effective_from, effective_to=excluded.effective_to, created_at=excluded.created_at, updated_at=excluded.updated_at;
  insert into public.partner_name_history select * from jsonb_populate_recordset(null::public.partner_name_history, coalesce(p_data->'partnerNameHistory','[]'::jsonb))
    on conflict (id) do update set workspace_owner_id=excluded.workspace_owner_id, partner_id=excluded.partner_id, old_display_name=excluded.old_display_name, new_display_name=excluded.new_display_name, changed_at=excluded.changed_at, changed_by_account_id=excluded.changed_by_account_id, created_at=excluded.created_at;

  insert into public.partner_settlement_batches
    (id,workspace_owner_id,property_id,period_start,period_end,status,total_income,total_expense,net_profit,currency,confirmed_at,confirmed_by_account_id,reversed_at,reversed_by_account_id,reversal_reason,note,created_at,updated_at,property_name_snapshot,confirmed_by_display_name_snapshot,income_details_snapshot,expense_details_snapshot)
  select id,workspace_owner_id,property_id,period_start,period_end,status,total_income,total_expense,net_profit,currency,confirmed_at,confirmed_by_account_id,reversed_at,reversed_by_account_id,reversal_reason,note,created_at,updated_at,property_name_snapshot,confirmed_by_display_name_snapshot,income_details_snapshot,expense_details_snapshot
  from jsonb_to_recordset(coalesce(p_data->'settlementBatches','[]'::jsonb)) as x(id uuid,workspace_owner_id uuid,property_id uuid,period_start date,period_end date,status text,total_income numeric,total_expense numeric,net_profit numeric,currency text,confirmed_at timestamptz,confirmed_by_account_id uuid,reversed_at timestamptz,reversed_by_account_id uuid,reversal_reason text,note text,created_at timestamptz,updated_at timestamptz,property_name_snapshot text,confirmed_by_display_name_snapshot text,income_details_snapshot jsonb,expense_details_snapshot jsonb)
  on conflict (id) do update set workspace_owner_id=excluded.workspace_owner_id,property_id=excluded.property_id,period_start=excluded.period_start,period_end=excluded.period_end,status=excluded.status,total_income=excluded.total_income,total_expense=excluded.total_expense,net_profit=excluded.net_profit,currency=excluded.currency,confirmed_at=excluded.confirmed_at,confirmed_by_account_id=excluded.confirmed_by_account_id,reversed_at=excluded.reversed_at,reversed_by_account_id=excluded.reversed_by_account_id,reversal_reason=excluded.reversal_reason,note=excluded.note,created_at=excluded.created_at,updated_at=excluded.updated_at,property_name_snapshot=excluded.property_name_snapshot,confirmed_by_display_name_snapshot=excluded.confirmed_by_display_name_snapshot,income_details_snapshot=excluded.income_details_snapshot,expense_details_snapshot=excluded.expense_details_snapshot;
  insert into public.partner_settlement_partner_snapshots select * from jsonb_populate_recordset(null::public.partner_settlement_partner_snapshots, coalesce(p_data->'settlementPartnerSnapshots','[]'::jsonb));
  insert into public.partner_settlement_segment_snapshots select * from jsonb_populate_recordset(null::public.partner_settlement_segment_snapshots, coalesce(p_data->'settlementSegmentSnapshots','[]'::jsonb));
  insert into public.partner_settlement_transfer_snapshots select * from jsonb_populate_recordset(null::public.partner_settlement_transfer_snapshots, coalesce(p_data->'settlementTransferSnapshots','[]'::jsonb));

  -- Final boundary validation. Any mismatch raises inside the transaction,
  -- so all writes above are rolled back together.
  if
    (select count(*) from public.properties where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'properties','[]'::jsonb))
    or (select count(*) from public.rooms where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'rooms','[]'::jsonb))
    or (select count(*) from public.tenants where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'tenants','[]'::jsonb))
    or (select count(*) from public.contracts where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'contracts','[]'::jsonb))
    or (select count(*) from public.rent_payments where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'rentPayments','[]'::jsonb))
    or (select count(*) from public.expenses where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'expenses','[]'::jsonb))
    or (select count(*) from public.deposits where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'deposits','[]'::jsonb))
    or (select count(*) from public.viewing_appointments where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'viewingAppointments','[]'::jsonb))
    or (select count(*) from public.tasks where user_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'tasks','[]'::jsonb))
    or (select count(*) from public.partners where workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'partners','[]'::jsonb))
    or (select count(*) from public.partner_property_shares where workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'partnerShares','[]'::jsonb))
    or (select count(*) from public.partner_name_history where workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'partnerNameHistory','[]'::jsonb))
    or (select count(*) from public.partner_settlement_batches where workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'settlementBatches','[]'::jsonb))
    or (select count(*) from public.partner_settlement_partner_snapshots s join public.partner_settlement_batches b on b.id=s.settlement_batch_id where b.workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'settlementPartnerSnapshots','[]'::jsonb))
    or (select count(*) from public.partner_settlement_segment_snapshots s join public.partner_settlement_batches b on b.id=s.settlement_batch_id where b.workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'settlementSegmentSnapshots','[]'::jsonb))
    or (select count(*) from public.partner_settlement_transfer_snapshots s join public.partner_settlement_batches b on b.id=s.settlement_batch_id where b.workspace_owner_id=p_workspace_owner_id) <> jsonb_array_length(coalesce(p_data->'settlementTransferSnapshots','[]'::jsonb))
  then
    raise exception 'Restore validation failed: restored record counts do not match the Backup V1 payload' using errcode = '23514';
  end if;

  insert into public.audit_logs (log_category,actor_user_id,action_type,module_key,entity_type,entity_id,after_data,description)
  values ('business',p_actor_account_id,'restore_workspace_backup','data_center','workspace',p_workspace_owner_id,jsonb_build_object('backupBoundary','Backup V1'),'Restore V4 completed');
end;
$$;

revoke all on function public.restore_workspace_backup(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup(uuid, uuid, jsonb) to service_role;
