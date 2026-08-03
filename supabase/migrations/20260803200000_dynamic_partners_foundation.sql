-- Dynamic partners foundation. Existing A/B business columns remain untouched.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  legacy_code text,
  display_name text not null,
  color_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  linked_account_id uuid references public.user_profiles(auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_display_name_not_blank check (btrim(display_name) <> ''),
  constraint partners_sort_order_nonnegative check (sort_order >= 0),
  constraint partners_legacy_code_not_blank check (legacy_code is null or btrim(legacy_code) <> ''),
  constraint partners_workspace_legacy_unique unique (workspace_owner_id, legacy_code)
);

create table if not exists public.partner_property_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  partner_id uuid not null references public.partners(id) on delete restrict,
  percentage numeric(5,2) not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_property_shares_percentage_range check (percentage >= 0 and percentage <= 100),
  constraint partner_property_shares_date_range check (effective_to is null or effective_to >= effective_from),
  constraint partner_property_shares_property_partner_start_unique unique (property_id, partner_id, effective_from)
);

create unique index if not exists partners_display_name_unique
  on public.partners (workspace_owner_id, lower(btrim(display_name)));
create index if not exists partners_workspace_active_sort_idx
  on public.partners (workspace_owner_id, is_active, sort_order, created_at);
create index if not exists partner_property_shares_workspace_property_date_idx
  on public.partner_property_shares (workspace_owner_id, property_id, effective_from);
create index if not exists partner_property_shares_partner_idx
  on public.partner_property_shares (partner_id, effective_from);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'partners_touch_updated_at') then
    create trigger partners_touch_updated_at
      before update on public.partners
      for each row execute function app_private.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'partner_property_shares_touch_updated_at') then
    create trigger partner_property_shares_touch_updated_at
      before update on public.partner_property_shares
      for each row execute function app_private.touch_updated_at();
  end if;
end $$;

create or replace function app_private.validate_partner_count()
returns trigger
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  workspace_id uuid := coalesce(new.workspace_owner_id, old.workspace_owner_id);
  active_count integer;
begin
  select count(*) into active_count from public.partners
    where workspace_owner_id = workspace_id and is_active;
  if active_count > 5 then
    raise exception 'A workspace may have at most five active partners';
  end if;
  if active_count < 1 then
    raise exception 'A workspace must keep at least one active partner';
  end if;
  if tg_op = 'delete' then return old; end if;
  return new;
end $$;

drop trigger if exists partners_validate_count on public.partners;
create constraint trigger partners_validate_count
  after insert or update or delete on public.partners
  deferrable initially deferred
  for each row execute function app_private.validate_partner_count();

create or replace function app_private.validate_partner_share_row()
returns trigger
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not exists (
    select 1 from public.partners p
    where p.id = new.partner_id
      and p.workspace_owner_id = new.workspace_owner_id
      and p.is_active
  ) then
    raise exception 'Share plans may only use active partners in the same workspace';
  end if;
  if not exists (
    select 1 from public.properties p
    where p.id = new.property_id and p.user_id = new.workspace_owner_id
  ) then
    raise exception 'Share plan property does not belong to its workspace';
  end if;
  if exists (
    select 1 from public.partner_property_shares s
    where s.property_id = new.property_id
      and s.partner_id = new.partner_id
      and s.id <> new.id
      and daterange(s.effective_from, coalesce(s.effective_to, '9999-12-31'::date), '[]')
          && daterange(new.effective_from, coalesce(new.effective_to, '9999-12-31'::date), '[]')
  ) then
    raise exception 'Partner share effective intervals may not overlap';
  end if;
  return new;
end $$;

drop trigger if exists partner_property_shares_validate_row on public.partner_property_shares;
create trigger partner_property_shares_validate_row
  before insert or update on public.partner_property_shares
  for each row execute function app_private.validate_partner_share_row();

create or replace function app_private.validate_partner_share_totals()
returns trigger
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  invalid_plan record;
begin
  for invalid_plan in
    select property_id, effective_from, sum(percentage) as total
    from public.partner_property_shares
    group by property_id, effective_from
    having abs(sum(percentage) - 100) > 0.005
  loop
    raise exception 'Each property share plan must total 100 percent (property %, date %, total %)', invalid_plan.property_id, invalid_plan.effective_from, invalid_plan.total;
  end loop;
  return null;
end $$;

drop trigger if exists partner_property_shares_validate_totals on public.partner_property_shares;
create constraint trigger partner_property_shares_validate_totals
  after insert or update or delete on public.partner_property_shares
  deferrable initially deferred
  for each row execute function app_private.validate_partner_share_totals();

alter table public.partners enable row level security;
alter table public.partner_property_shares enable row level security;

drop policy if exists partners_select_workspace on public.partners;
create policy partners_select_workspace on public.partners
  for select to authenticated
  using (workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partners_owner_insert on public.partners;
create policy partners_owner_insert on public.partners
  for insert to authenticated
  with check (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partners_owner_update on public.partners;
create policy partners_owner_update on public.partners
  for update to authenticated
  using (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id())
  with check (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partners_owner_delete on public.partners;
create policy partners_owner_delete on public.partners
  for delete to authenticated
  using (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());

drop policy if exists partner_property_shares_select_workspace on public.partner_property_shares;
create policy partner_property_shares_select_workspace on public.partner_property_shares
  for select to authenticated
  using (workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partner_property_shares_owner_insert on public.partner_property_shares;
create policy partner_property_shares_owner_insert on public.partner_property_shares
  for insert to authenticated
  with check (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partner_property_shares_owner_update on public.partner_property_shares;
create policy partner_property_shares_owner_update on public.partner_property_shares
  for update to authenticated
  using (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id())
  with check (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());
drop policy if exists partner_property_shares_owner_delete on public.partner_property_shares;
create policy partner_property_shares_owner_delete on public.partner_property_shares
  for delete to authenticated
  using (app_private.is_owner() and workspace_owner_id = app_private.current_workspace_owner_id());

grant select, insert, update, delete on public.partners to authenticated;
grant select, insert, update, delete on public.partner_property_shares to authenticated;
revoke all on public.partners from anon;
revoke all on public.partner_property_shares from anon;

-- Seed the compatibility records and one initial 50/50 plan per property. No
-- existing business record is updated by this block.
insert into public.partners (workspace_owner_id, legacy_code, display_name, sort_order)
select distinct p.user_id, 'A', 'A', 1
from public.properties p
on conflict (workspace_owner_id, legacy_code) do nothing;
insert into public.partners (workspace_owner_id, legacy_code, display_name, sort_order)
select distinct p.user_id, 'B', 'B', 2
from public.properties p
on conflict (workspace_owner_id, legacy_code) do nothing;

do $$
declare
  missing_property record;
begin
  for missing_property in
    select p.id
    from public.properties p
    where coalesce(
      p.occupancy_tracking_start_date,
      date_trunc('month', (select min(c.start_date) from public.contracts c where c.property_id = p.id and c.start_date is not null))::date,
      date_trunc('month', (select min(rp.coverage_start_date) from public.rent_payments rp where rp.property_id = p.id and rp.coverage_start_date is not null and coalesce(rp.notes, '') not like '%已作废%' and lower(coalesce(rp.notes, '')) not like '%void%'))::date,
      date_trunc('month', (select min(rp.payment_date) from public.rent_payments rp where rp.property_id = p.id and rp.payment_date is not null and coalesce(rp.notes, '') not like '%已作废%' and lower(coalesce(rp.notes, '')) not like '%void%'))::date,
      date_trunc('month', (select min(e.expense_month) from public.expenses e where e.property_id = p.id and e.expense_month is not null and coalesce(e.notes, '') not like '%已作废%' and lower(coalesce(e.notes, '')) not like '%void%'))::date
    ) is null
  loop
    raise exception 'Cannot initialize partner share date for property % without a reliable business date', missing_property.id;
  end loop;
end $$;

insert into public.partner_property_shares (workspace_owner_id, property_id, partner_id, percentage, effective_from)
select p.user_id, p.id, pa.id, 50.00,
  coalesce(
    p.occupancy_tracking_start_date,
    date_trunc('month', (select min(c.start_date) from public.contracts c where c.property_id = p.id and c.start_date is not null))::date,
    date_trunc('month', (select min(rp.coverage_start_date) from public.rent_payments rp where rp.property_id = p.id and rp.coverage_start_date is not null and coalesce(rp.notes, '') not like '%已作废%' and lower(coalesce(rp.notes, '')) not like '%void%'))::date,
    date_trunc('month', (select min(rp.payment_date) from public.rent_payments rp where rp.property_id = p.id and rp.payment_date is not null and coalesce(rp.notes, '') not like '%已作废%' and lower(coalesce(rp.notes, '')) not like '%void%'))::date,
    date_trunc('month', (select min(e.expense_month) from public.expenses e where e.property_id = p.id and e.expense_month is not null and coalesce(e.notes, '') not like '%已作废%' and lower(coalesce(e.notes, '')) not like '%void%'))::date
  )
from public.properties p
join public.partners pa on pa.workspace_owner_id = p.user_id and pa.legacy_code = 'A'
on conflict (property_id, partner_id, effective_from) do nothing;
insert into public.partner_property_shares (workspace_owner_id, property_id, partner_id, percentage, effective_from)
select p.user_id, p.id, pb.id, 50.00,
  coalesce(
    p.occupancy_tracking_start_date,
    date_trunc('month', (select min(c.start_date) from public.contracts c where c.property_id = p.id and c.start_date is not null))::date,
    date_trunc('month', (select min(rp.coverage_start_date) from public.rent_payments rp where rp.property_id = p.id and rp.coverage_start_date is not null and coalesce(rp.notes, '') not like '%已作废%' and lower(coalesce(rp.notes, '')) not like '%void%'))::date,
    date_trunc('month', (select min(rp.payment_date) from public.rent_payments rp where rp.property_id = p.id and rp.payment_date is not null and coalesce(rp.notes, '') not like '%已作废%' and lower(coalesce(rp.notes, '')) not like '%void%'))::date,
    date_trunc('month', (select min(e.expense_month) from public.expenses e where e.property_id = p.id and e.expense_month is not null and coalesce(e.notes, '') not like '%已作废%' and lower(coalesce(e.notes, '')) not like '%void%'))::date
  )
from public.properties p
join public.partners pb on pb.workspace_owner_id = p.user_id and pb.legacy_code = 'B'
on conflict (property_id, partner_id, effective_from) do nothing;
