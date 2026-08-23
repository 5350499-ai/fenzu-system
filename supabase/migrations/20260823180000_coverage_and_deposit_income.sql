-- Coverage belongs to the tenancy contract, not to the existence of a rent
-- payment. Deposit income is a separate financial-ledger row linked to the
-- deposit lifecycle record. Existing business rows are not backfilled.

begin;

alter table public.contracts
  add column if not exists coverage_start_date date,
  add column if not exists coverage_end_date date;

alter table public.rent_payments
  add column if not exists source_deposit_id uuid references public.deposits(id);

create unique index if not exists rent_payments_workspace_source_deposit_idx
  on public.rent_payments (user_id, source_deposit_id)
  where source_deposit_id is not null;

comment on column public.contracts.coverage_start_date is
  'Canonical tenancy coverage start date; independent of rent payment existence.';
comment on column public.contracts.coverage_end_date is
  'Canonical tenancy coverage end date; independent of rent payment existence.';
comment on column public.rent_payments.source_deposit_id is
  'Stable source identity for a deposit-income ledger row; null for rent and other income rows.';

do $migration$
declare
  v_source text;
  v_marker text;
  v_replacement text;
begin
  select pg_get_functiondef(
    'public.create_atomic_check_in(uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,smallint,date,date,date,date,text,text,text,text,text)'::regprocedure
  ) into v_source;
  if v_source is null then
    raise exception 'create_atomic_check_in was not found';
  end if;

  if position('v_has_rent_state' in v_source) = 0
     or position('insert into public.contracts' in v_source) = 0
     or position('insert into public.deposits' in v_source) = 0
     or position('update public.rooms' in v_source) = 0
     or position('rent_payment_id = v_payment_id' in v_source) = 0 then
    raise exception 'create_atomic_check_in reviewed shape is unknown; refusing to alter it';
  end if;

  v_marker := 'v_deposit_id uuid;';
  v_replacement := v_marker || E'\n  v_deposit_income_payment_id uuid;';
  if position(v_marker in v_source) = 0 then
    raise exception 'create_atomic_check_in deposit declaration marker not found';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'deposit_amount, start_date, end_date, status, notes';
  v_replacement := 'deposit_amount, start_date, end_date, coverage_start_date, coverage_end_date, status, notes';
  if position(v_marker in v_source) = 0 then
    raise exception 'create_atomic_check_in contract column marker not found';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := 'coalesce(p_deposit_amount, 0), p_coverage_start_date, p_contract_end_date, ''有效'', nullif(btrim(coalesce(p_notes, '''')), '''')';
  v_replacement := 'coalesce(p_deposit_amount, 0), p_coverage_start_date, p_coverage_end_date, p_contract_end_date, ''有效'', nullif(btrim(coalesce(p_notes, '''')), '''')';
  if position(v_marker in v_source) = 0 then
    raise exception 'create_atomic_check_in contract values marker not found';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := E'  update public.rooms\n  set status = ''已租''';
  v_replacement := E'  if v_collected_deposit > 0 then\n'
    || E'    v_deposit_income_payment_id := gen_random_uuid();\n'
    || E'    insert into public.rent_payments (\n'
    || E'      id, user_id, tenant_id, property_id, room_id, rent_month,\n'
    || E'      amount_due, amount_paid, amount_unpaid, payment_date, payment_method,\n'
    || E'      is_overdue, notes, received_by, payment_status, income_type, income_item, source_deposit_id\n'
    || E'    ) values (\n'
    || E'      v_deposit_income_payment_id, v_actor.workspace_owner_id, v_tenant_id, p_property_id, p_room_id,\n'
    || E'      date_trunc(''month'', p_payment_date)::date, 0, v_collected_deposit, 0, p_payment_date,\n'
    || E'      coalesce(nullif(btrim(coalesce(p_payment_method, '''')), ''''), ''转账''),\n'
    || E'      false, ''[押金收入]'' || coalesce(nullif(btrim(coalesce(p_notes, '''')), ''''), ''''),\n'
    || E'      coalesce(nullif(btrim(coalesce(p_received_by, '''')), ''''), ''A''), ''已收'', ''押金收入'', ''押金收入'', v_deposit_id\n'
    || E'    );\n'
    || E'  end if;\n\n'
    || v_marker;
  if position(v_marker in v_source) = 0 then
    raise exception 'create_atomic_check_in room update marker not found';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);

  v_marker := '''depositId'', v_deposit_id,';
  v_replacement := v_marker || E'\n    ''depositIncomePaymentId'', v_deposit_income_payment_id,';
  if position(v_marker in v_source) = 0 then
    raise exception 'create_atomic_check_in result marker not found';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);

  execute v_source;
end;
$migration$;

do $restore$
declare
  v_source text;
  v_marker text;
  v_replacement text;
  v_contract_block text;
  v_contract_patched text;
  v_contract_start integer;
  v_contract_end integer;
  v_rent_block text;
  v_rent_normalized text;
  v_rent_patched text;
  v_rent_start integer;
  v_rent_end integer;
  v_field text;
begin
  select pg_get_functiondef('public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure)
    into v_source;
  if v_source is null then
    raise exception 'restore_workspace_backup_impl was not found';
  end if;

  v_marker := E'begin\n  raise log ''restore_stage=impl_start'';';
  v_replacement := v_marker || E'\n  p_data := jsonb_set(\n'
    || E'    p_data,\n'
    || E'    ''{contracts}'',\n'
    || E'    coalesce((select jsonb_agg(\n'
    || E'      case when x ? ''coverage_start_date'' and x ? ''coverage_end_date'' then x\n'
    || E'      else x || jsonb_build_object(\n'
    || E'        ''coverage_start_date'', coalesce(x->''coverage_start_date'', to_jsonb(c.coverage_start_date)),\n'
    || E'        ''coverage_end_date'', coalesce(x->''coverage_end_date'', to_jsonb(c.coverage_end_date))\n'
    || E'      ) end)\n'
    || E'      from jsonb_array_elements(coalesce(p_data->''contracts'', ''[]''::jsonb)) x\n'
    || E'      left join public.contracts c on c.id=(x->>''id'')::uuid and c.user_id=p_workspace_owner_id\n'
    || E'    ), ''[]''::jsonb),\n'
    || E'    true\n'
    || E'  );';
  if position(v_marker in v_source) = 0 then
    raise exception 'Restore legacy contract compatibility marker not found; refusing to alter it';
  end if;
  v_source := replace(v_source, v_marker, v_replacement);

  if position('insert into public.contracts select * from jsonb_populate_recordset(null::public.contracts' in v_source) = 0 then
    raise exception 'Restore contract insert mapping is unknown; refusing to alter it';
  end if;

  v_contract_start := position('insert into public.contracts select * from jsonb_populate_recordset(null::public.contracts' in v_source);
  v_contract_end := position('raise log ''restore_stage=insert_rent_payments_start'';' in substring(v_source from v_contract_start));
  if v_contract_end = 0 then
    raise exception 'Restore contract upsert boundary is unknown; refusing to alter it';
  end if;
  v_contract_block := substring(v_source from v_contract_start for v_contract_end - 1);

  foreach v_contract_start in array array[
    position('user_id=excluded.user_id' in v_contract_block),
    position('property_id=excluded.property_id' in v_contract_block),
    position('room_id=excluded.room_id' in v_contract_block),
    position('tenant_id=excluded.tenant_id' in v_contract_block),
    position('landlord_id=excluded.landlord_id' in v_contract_block),
    position('monthly_rent=excluded.monthly_rent' in v_contract_block),
    position('deposit_amount=excluded.deposit_amount' in v_contract_block),
    position('start_date=excluded.start_date' in v_contract_block),
    position('end_date=excluded.end_date' in v_contract_block),
    position('is_signed=excluded.is_signed' in v_contract_block),
    position('is_active=excluded.is_active' in v_contract_block),
    position('status=excluded.status' in v_contract_block),
    position('file_url=excluded.file_url' in v_contract_block),
    position('storage_path=excluded.storage_path' in v_contract_block),
    position('notes=excluded.notes' in v_contract_block),
    position('created_at=excluded.created_at' in v_contract_block),
    position('updated_at=excluded.updated_at' in v_contract_block)
  ] loop
    if v_contract_start = 0 then
      raise exception 'Restore contract relationship or field mapping is incomplete; refusing to alter it';
    end if;
  end loop;

  if position('coverage_start_date=excluded.coverage_start_date' in v_contract_block) > 0
     or position('coverage_end_date=excluded.coverage_end_date' in v_contract_block) > 0 then
    raise exception 'Restore contract coverage mapping already exists in an unknown shape; refusing to alter it';
  end if;
  v_contract_patched := regexp_replace(
    v_contract_block,
    'start_date\s*=\s*excluded\.start_date\s*,\s*end_date\s*=\s*excluded\.end_date\s*,',
    'start_date=excluded.start_date, end_date=excluded.end_date, coverage_start_date=excluded.coverage_start_date, coverage_end_date=excluded.coverage_end_date,',
    1, 1, 'n'
  );
  if v_contract_patched = v_contract_block then
    raise exception 'Restore contract coverage insertion point not found; refusing to alter it';
  end if;
  v_source := replace(v_source, v_contract_block, v_contract_patched);

  v_rent_start := position('insert into public.rent_payments select * from jsonb_populate_recordset(null::public.rent_payments' in v_source);
  if v_rent_start = 0 then
    raise exception 'Restore rent payment insert mapping is unknown; refusing to alter it';
  end if;
  v_rent_end := position('raise log ''restore_stage=insert_expenses_start'';' in substring(v_source from v_rent_start));
  if v_rent_end = 0 then
    raise exception 'Restore rent payment upsert boundary is unknown; refusing to alter it';
  end if;
  v_rent_block := substring(v_source from v_rent_start for v_rent_end - 1);
  v_rent_normalized := regexp_replace(v_rent_block, '\s+', '', 'g');

  foreach v_field in array array[
    'payment_status=excluded.payment_status',
    'income_type=excluded.income_type',
    'income_item=excluded.income_item',
    'client_request_id=excluded.client_request_id'
  ] loop
    if position(v_field in v_rent_normalized) = 0 then
      raise exception 'Restore rent payment field mapping is incomplete; refusing to alter it';
    end if;
  end loop;

  if position('source_deposit_id=excluded.source_deposit_id' in v_rent_normalized) > 0 then
    raise exception 'Restore rent payment source-deposit mapping already exists in an unknown shape; refusing to alter it';
  end if;
  v_rent_patched := regexp_replace(
    v_rent_block,
    ';\s*$',
    ', source_deposit_id=excluded.source_deposit_id;',
    1, 1, 'n'
  );
  if v_rent_patched = v_rent_block then
    raise exception 'Restore rent payment source-deposit insertion point not found; refusing to alter it';
  end if;
  v_source := replace(v_source, v_rent_block, v_rent_patched);

  execute v_source;
end;
$restore$;

commit;
