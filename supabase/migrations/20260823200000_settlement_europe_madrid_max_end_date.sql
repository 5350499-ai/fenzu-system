-- Enforce the settlement business-day boundary at the database boundary.
-- This preserves both existing overloads and the current service_role-only grant.

create or replace function public.confirm_partner_settlement(
  p_workspace_owner_id uuid, p_property_id uuid, p_period_start date, p_period_end date,
  p_total_income numeric, p_total_expense numeric, p_net_profit numeric,
  p_confirmed_by_account_id uuid, p_partners jsonb, p_segments jsonb, p_transfers jsonb, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare batch_id uuid; item jsonb; partner_id uuid;
begin
  if not exists (select 1 from public.properties where id = p_property_id and user_id = p_workspace_owner_id) then
    raise exception 'Property does not belong to workspace' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Settlement date range is invalid' using errcode = '22007';
  end if;
  if p_period_end > (timezone('Europe/Madrid', now())::date - 1) then
    raise exception 'Settlement end date cannot be later than business yesterday' using errcode = '22007';
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_partners, '[]'::jsonb)) loop
    partner_id := (item->>'partnerId')::uuid;
    if not exists (select 1 from public.partners where id = partner_id and workspace_owner_id = p_workspace_owner_id) then
      raise exception 'Partner does not belong to workspace' using errcode = '42501';
    end if;
  end loop;
  insert into public.partner_settlement_batches (workspace_owner_id, property_id, period_start, period_end, total_income, total_expense, net_profit, confirmed_by_account_id, note)
    values (p_workspace_owner_id, p_property_id, p_period_start, p_period_end, round(p_total_income,2), round(p_total_expense,2), round(p_net_profit,2), p_confirmed_by_account_id, p_note) returning id into batch_id;
  for item in select value from jsonb_array_elements(coalesce(p_partners, '[]'::jsonb)) loop
    insert into public.partner_settlement_partner_snapshots (settlement_batch_id, partner_id, partner_display_name_snapshot, legacy_code_snapshot, actual_collected, actual_paid, actual_retained, profit_entitlement, settlement_balance, share_segments_snapshot)
      values (batch_id, (item->>'partnerId')::uuid, item->>'displayName', nullif(item->>'legacyCode',''), coalesce((item->>'collected')::numeric,0), coalesce((item->>'advanced')::numeric,0), coalesce((item->>'actualRetained')::numeric,0), coalesce((item->>'profitEntitlement')::numeric,0), coalesce((item->>'balance')::numeric,0), coalesce(item->'shareSegments','[]'::jsonb));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_segments, '[]'::jsonb)) loop
    insert into public.partner_settlement_segment_snapshots (settlement_batch_id, segment_start, segment_end, total_income, total_expense, net_profit, shares_snapshot)
      values (batch_id, (item->>'startDate')::date, (item->>'endDate')::date, coalesce((item->>'income')::numeric,0), coalesce((item->>'expense')::numeric,0), coalesce((item->>'netProfit')::numeric,0), coalesce(item->'shares','[]'::jsonb));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) loop
    insert into public.partner_settlement_transfer_snapshots (settlement_batch_id, from_partner_id, to_partner_id, from_name_snapshot, to_name_snapshot, amount)
      values (batch_id, (item->>'fromPartnerId')::uuid, (item->>'toPartnerId')::uuid, item->>'fromName', item->>'toName', (item->>'amount')::numeric);
  end loop;
  insert into public.audit_logs (log_category, actor_user_id, action_type, module_key, entity_type, entity_id, property_id, after_data, description)
    values ('business', p_confirmed_by_account_id, 'confirm_partner_settlement', 'partnership_settlement', 'partner_settlement_batch', batch_id, p_property_id, jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end,'totalIncome',p_total_income,'totalExpense',p_total_expense,'netProfit',p_net_profit), 'confirm partner settlement snapshot');
  return batch_id;
exception when exclusion_violation then
  raise exception 'Settlement period overlaps a confirmed settlement' using errcode = '23P01';
end $$;

create or replace function public.confirm_partner_settlement(
  p_workspace_owner_id uuid, p_property_id uuid, p_period_start date, p_period_end date,
  p_total_income numeric, p_total_expense numeric, p_net_profit numeric,
  p_confirmed_by_account_id uuid, p_partners jsonb, p_segments jsonb, p_transfers jsonb,
  p_note text, p_property_name_snapshot text, p_confirmed_by_display_name_snapshot text,
  p_income_details jsonb, p_expense_details jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare batch_id uuid; item jsonb;
begin
  if not exists (select 1 from public.properties where id = p_property_id and user_id = p_workspace_owner_id) then
    raise exception 'Property does not belong to workspace' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Settlement date range is invalid' using errcode = '22007';
  end if;
  if p_period_end > (timezone('Europe/Madrid', now())::date - 1) then
    raise exception 'Settlement end date cannot be later than business yesterday' using errcode = '22007';
  end if;
  insert into public.partner_settlement_batches
    (workspace_owner_id, property_id, period_start, period_end, total_income, total_expense, net_profit,
     confirmed_by_account_id, note, property_name_snapshot, confirmed_by_display_name_snapshot,
     income_details_snapshot, expense_details_snapshot)
  values
    (p_workspace_owner_id, p_property_id, p_period_start, p_period_end, round(p_total_income,2), round(p_total_expense,2), round(p_net_profit,2),
     p_confirmed_by_account_id, p_note, nullif(btrim(p_property_name_snapshot), ''), nullif(btrim(p_confirmed_by_display_name_snapshot), ''),
     coalesce(p_income_details, '[]'::jsonb), coalesce(p_expense_details, '[]'::jsonb))
  returning id into batch_id;
  for item in select value from jsonb_array_elements(coalesce(p_partners, '[]'::jsonb)) loop
    insert into public.partner_settlement_partner_snapshots
      (settlement_batch_id, partner_id, partner_display_name_snapshot, legacy_code_snapshot, actual_collected, actual_paid, actual_retained, profit_entitlement, settlement_balance, share_segments_snapshot)
    values (batch_id, (item->>'partnerId')::uuid, item->>'displayName', nullif(item->>'legacyCode',''), coalesce((item->>'collected')::numeric,0), coalesce((item->>'advanced')::numeric,0), coalesce((item->>'actualRetained')::numeric,0), coalesce((item->>'profitEntitlement')::numeric,0), coalesce((item->>'balance')::numeric,0), coalesce(item->'shareSegments','[]'::jsonb));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_segments, '[]'::jsonb)) loop
    insert into public.partner_settlement_segment_snapshots (settlement_batch_id, segment_start, segment_end, total_income, total_expense, net_profit, shares_snapshot)
    values (batch_id, (item->>'startDate')::date, (item->>'endDate')::date, coalesce((item->>'income')::numeric,0), coalesce((item->>'expense')::numeric,0), coalesce((item->>'netProfit')::numeric,0), coalesce(item->'shares','[]'::jsonb));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) loop
    insert into public.partner_settlement_transfer_snapshots
      (settlement_batch_id, from_partner_id, to_partner_id, from_name_snapshot, to_name_snapshot, amount)
    values (batch_id, (item->>'fromPartnerId')::uuid, (item->>'toPartnerId')::uuid, item->>'fromName', item->>'toName', (item->>'amount')::numeric);
  end loop;
  insert into public.audit_logs (log_category, actor_user_id, action_type, module_key, entity_type, entity_id, property_id, after_data, description)
  values ('business', p_confirmed_by_account_id, 'confirm_partner_settlement', 'partnership_settlement', 'partner_settlement_batch', batch_id, p_property_id,
    jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end,'totalIncome',p_total_income,'totalExpense',p_total_expense,'netProfit',p_net_profit), 'confirm partner settlement snapshot');
  return batch_id;
exception when exclusion_violation then
  raise exception 'Settlement period overlaps a confirmed settlement' using errcode = '23P01';
end $$;

revoke all on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text) to service_role;
revoke all on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text,text,text,jsonb,jsonb) to service_role;
