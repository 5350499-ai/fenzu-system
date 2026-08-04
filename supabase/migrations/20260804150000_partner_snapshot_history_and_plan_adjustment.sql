-- Additive support for immutable settlement review, partner name history,
-- and owner-controlled adjustment of the first share-plan start date.

alter table public.partner_settlement_batches
  add column if not exists property_name_snapshot text,
  add column if not exists confirmed_by_display_name_snapshot text,
  add column if not exists income_details_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists expense_details_snapshot jsonb not null default '[]'::jsonb;

create table if not exists public.partner_name_history (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  partner_id uuid not null references public.partners(id) on delete restrict,
  old_display_name text not null,
  new_display_name text not null,
  changed_at timestamptz not null default now(),
  changed_by_account_id uuid,
  created_at timestamptz not null default now(),
  check (btrim(old_display_name) <> ''),
  check (btrim(new_display_name) <> '')
);

create index if not exists partner_name_history_workspace_idx
  on public.partner_name_history (workspace_owner_id, changed_at desc);
create index if not exists partner_name_history_partner_idx
  on public.partner_name_history (partner_id, changed_at desc);

alter table public.partner_name_history enable row level security;
drop policy if exists partner_name_history_select_workspace on public.partner_name_history;
create policy partner_name_history_select_workspace on public.partner_name_history
  for select to authenticated
  using (workspace_owner_id = app_private.current_workspace_owner_id());
revoke all on public.partner_name_history from anon;
grant select on public.partner_name_history to authenticated;

create or replace function public.rename_partner_with_history(
  p_workspace_owner_id uuid,
  p_partner_id uuid,
  p_new_display_name text,
  p_changed_by_account_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_name text;
begin
  if nullif(btrim(p_new_display_name), '') is null then
    raise exception 'Partner display name is required' using errcode = '22023';
  end if;
  select display_name into current_name
    from public.partners
   where id = p_partner_id and workspace_owner_id = p_workspace_owner_id
   for update;
  if current_name is null then
    raise exception 'Partner does not belong to workspace' using errcode = '42501';
  end if;
  if btrim(current_name) = btrim(p_new_display_name) then
    return;
  end if;
  update public.partners
     set display_name = btrim(p_new_display_name), updated_at = now()
   where id = p_partner_id and workspace_owner_id = p_workspace_owner_id;
  insert into public.partner_name_history
    (workspace_owner_id, partner_id, old_display_name, new_display_name, changed_by_account_id)
  values
    (p_workspace_owner_id, p_partner_id, current_name, btrim(p_new_display_name), p_changed_by_account_id);
end;
$$;

create or replace function public.adjust_first_partner_share_start_date(
  p_workspace_owner_id uuid,
  p_property_id uuid,
  p_new_effective_from date,
  p_changed_by_account_id uuid
) returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  first_date date;
  next_date date;
  changed_count integer;
begin
  if not exists (select 1 from public.properties where id = p_property_id and user_id = p_workspace_owner_id) then
    raise exception 'Property does not belong to workspace' using errcode = '42501';
  end if;
  select min(effective_from) into first_date
    from public.partner_property_shares
   where workspace_owner_id = p_workspace_owner_id and property_id = p_property_id;
  if first_date is null then raise exception 'Property has no share plan' using errcode = '22023'; end if;
  select min(effective_from) into next_date
    from public.partner_property_shares
   where workspace_owner_id = p_workspace_owner_id and property_id = p_property_id and effective_from > first_date;
  if p_new_effective_from is null or p_new_effective_from >= first_date then
    raise exception 'First share plan can only move earlier' using errcode = '22023';
  end if;
  if next_date is not null and p_new_effective_from >= next_date then
    raise exception 'First share plan would overlap the next plan' using errcode = '23P01';
  end if;
  update public.partner_property_shares
     set effective_from = p_new_effective_from, updated_at = now()
   where workspace_owner_id = p_workspace_owner_id and property_id = p_property_id and effective_from = first_date;
  get diagnostics changed_count = row_count;
  if changed_count = 0 then raise exception 'First share plan was not updated' using errcode = '40001'; end if;
  insert into public.audit_logs
    (log_category, actor_user_id, action_type, module_key, entity_type, entity_id, property_id, after_data, description)
  values
    ('business', p_changed_by_account_id, 'adjust_first_partner_share_start_date', 'settings', 'property_share_plan', p_property_id, p_property_id,
     jsonb_build_object('oldEffectiveFrom', first_date, 'newEffectiveFrom', p_new_effective_from), 'adjust first partner share plan start date');
  return p_new_effective_from;
end;
$$;

revoke all on function public.rename_partner_with_history(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.rename_partner_with_history(uuid,uuid,text,uuid) to service_role;
revoke all on function public.adjust_first_partner_share_start_date(uuid,uuid,date,uuid) from public, anon, authenticated;
grant execute on function public.adjust_first_partner_share_start_date(uuid,uuid,date,uuid) to service_role;

-- New overload: old confirmation function remains for compatibility, while new
-- confirmations persist immutable property/account and line-item snapshots.
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
    insert into public.partner_settlement_transfer_snapshots (settlement_batch_id, from_partner_id, to_partner_id, from_name_snapshot, to_name_snapshot, amount)
    values (batch_id, (item->>'fromPartnerId')::uuid, (item->>'toPartnerId')::uuid, item->>'fromName', item->>'toName', (item->>'amount')::numeric);
  end loop;
  insert into public.audit_logs (log_category, actor_user_id, action_type, module_key, entity_type, entity_id, property_id, after_data, description)
  values ('business', p_confirmed_by_account_id, 'confirm_partner_settlement', 'partnership_settlement', 'partner_settlement_batch', batch_id, p_property_id,
    jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end,'totalIncome',p_total_income,'totalExpense',p_total_expense,'netProfit',p_net_profit), 'confirm partner settlement snapshot');
  return batch_id;
exception when exclusion_violation then
  raise exception 'Settlement period overlaps a confirmed settlement' using errcode = '23P01';
end $$;

revoke all on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text,text,text,jsonb,jsonb) to service_role;
