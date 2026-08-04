-- Dynamic partner settlement snapshots. Legacy business records remain unchanged.
create extension if not exists btree_gist;

create table if not exists public.partner_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  period_range daterange generated always as (daterange(period_start, period_end, '[]')) stored,
  status text not null default 'confirmed' check (status in ('confirmed','reversed')),
  total_income numeric(14,2) not null default 0,
  total_expense numeric(14,2) not null default 0,
  net_profit numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  confirmed_at timestamptz not null default now(),
  confirmed_by_account_id uuid,
  reversed_at timestamptz,
  reversed_by_account_id uuid,
  reversal_reason text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.partner_settlement_batches drop constraint if exists partner_settlement_batches_confirmed_period_excl;
alter table public.partner_settlement_batches add constraint partner_settlement_batches_confirmed_period_excl
  exclude using gist (workspace_owner_id with =, property_id with =, period_range with &&)
  where (status = 'confirmed');

create table if not exists public.partner_settlement_partner_snapshots (
  id uuid primary key default gen_random_uuid(),
  settlement_batch_id uuid not null references public.partner_settlement_batches(id) on delete restrict,
  partner_id uuid not null references public.partners(id) on delete restrict,
  partner_display_name_snapshot text not null,
  legacy_code_snapshot text,
  actual_collected numeric(14,2) not null default 0,
  actual_paid numeric(14,2) not null default 0,
  actual_retained numeric(14,2) not null default 0,
  profit_entitlement numeric(14,2) not null default 0,
  settlement_balance numeric(14,2) not null default 0,
  share_segments_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (settlement_batch_id, partner_id)
);

create table if not exists public.partner_settlement_segment_snapshots (
  id uuid primary key default gen_random_uuid(),
  settlement_batch_id uuid not null references public.partner_settlement_batches(id) on delete restrict,
  segment_start date not null,
  segment_end date not null,
  total_income numeric(14,2) not null default 0,
  total_expense numeric(14,2) not null default 0,
  net_profit numeric(14,2) not null default 0,
  shares_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (segment_end >= segment_start)
);

create table if not exists public.partner_settlement_transfer_snapshots (
  id uuid primary key default gen_random_uuid(),
  settlement_batch_id uuid not null references public.partner_settlement_batches(id) on delete restrict,
  from_partner_id uuid not null references public.partners(id) on delete restrict,
  to_partner_id uuid not null references public.partners(id) on delete restrict,
  from_name_snapshot text not null,
  to_name_snapshot text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  check (from_partner_id <> to_partner_id)
);

create index if not exists partner_settlement_batches_workspace_date_idx on public.partner_settlement_batches (workspace_owner_id, period_end desc);
create index if not exists partner_settlement_batches_property_date_idx on public.partner_settlement_batches (property_id, period_end desc);
create index if not exists partner_settlement_partner_snapshots_batch_idx on public.partner_settlement_partner_snapshots (settlement_batch_id);
create index if not exists partner_settlement_segments_batch_idx on public.partner_settlement_segment_snapshots (settlement_batch_id, segment_start);
create index if not exists partner_settlement_transfers_batch_idx on public.partner_settlement_transfer_snapshots (settlement_batch_id);

alter table public.partner_settlement_batches enable row level security;
alter table public.partner_settlement_partner_snapshots enable row level security;
alter table public.partner_settlement_segment_snapshots enable row level security;
alter table public.partner_settlement_transfer_snapshots enable row level security;

drop policy if exists partner_settlement_batches_select on public.partner_settlement_batches;
create policy partner_settlement_batches_select on public.partner_settlement_batches for select to authenticated using (workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partner_settlement_batches_owner_insert on public.partner_settlement_batches;
create policy partner_settlement_batches_owner_insert on public.partner_settlement_batches for insert to authenticated with check (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partner_settlement_batches_owner_update on public.partner_settlement_batches;
create policy partner_settlement_batches_owner_update on public.partner_settlement_batches for update to authenticated using (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id()) with check (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());

drop policy if exists partner_settlement_snapshots_select on public.partner_settlement_partner_snapshots;
create policy partner_settlement_snapshots_select on public.partner_settlement_partner_snapshots for select to authenticated using (exists (select 1 from public.partner_settlement_batches b where b.id = settlement_batch_id and b.workspace_owner_id = app_private.current_workspace_owner_id()));
drop policy if exists partner_settlement_segments_select on public.partner_settlement_segment_snapshots;
create policy partner_settlement_segments_select on public.partner_settlement_segment_snapshots for select to authenticated using (exists (select 1 from public.partner_settlement_batches b where b.id = settlement_batch_id and b.workspace_owner_id = app_private.current_workspace_owner_id()));
drop policy if exists partner_settlement_transfers_select on public.partner_settlement_transfer_snapshots;
create policy partner_settlement_transfers_select on public.partner_settlement_transfer_snapshots for select to authenticated using (exists (select 1 from public.partner_settlement_batches b where b.id = settlement_batch_id and b.workspace_owner_id = app_private.current_workspace_owner_id()));

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

create or replace function public.reverse_partner_settlement(p_workspace_owner_id uuid, p_batch_id uuid, p_reversed_by_account_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'Reversal reason is required'; end if;
  update public.partner_settlement_batches set status='reversed', reversed_at=now(), reversed_by_account_id=p_reversed_by_account_id, reversal_reason=btrim(p_reason)
    where id=p_batch_id and workspace_owner_id=p_workspace_owner_id and status='confirmed';
  if not found then raise exception 'Settlement batch does not exist or is already reversed'; end if;
  insert into public.audit_logs (log_category, actor_user_id, action_type, module_key, entity_type, entity_id, after_data, description)
    values ('business', p_reversed_by_account_id, 'reverse_partner_settlement', 'partnership_settlement', 'partner_settlement_batch', p_batch_id, jsonb_build_object('reason',p_reason), 'reverse partner settlement snapshot');
end $$;

revoke all on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text) to service_role;
revoke all on function public.reverse_partner_settlement(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reverse_partner_settlement(uuid,uuid,uuid,text) to service_role;
