-- Complete the lifecycle of future partner share plans without changing
-- historical business records or already effective share percentages.

create or replace function app_private.rebuild_partner_share_intervals(p_property_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  with ordered as (
    select id,
      lead(effective_from) over (order by effective_from) as next_start
    from public.partner_property_shares
    where property_id = p_property_id
  )
  update public.partner_property_shares s
  set effective_to = case when ordered.next_start is null then null else ordered.next_start - 1 end
  from ordered
  where s.id = ordered.id;
end $$;

create or replace function public.replace_partner_property_share_plan(
  p_workspace_owner_id uuid,
  p_property_id uuid,
  p_effective_from date,
  p_rows jsonb
)
returns setof public.partner_property_shares
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  row_count integer;
  distinct_count integer;
  total numeric;
begin
  if p_effective_from is null then
    raise exception 'Share plan effective date is required';
  end if;
  if not exists (select 1 from public.properties where id = p_property_id and user_id = p_workspace_owner_id) then
    raise exception 'Property does not belong to workspace';
  end if;

  select count(*), count(distinct item->>'partnerId'), coalesce(sum((item->>'percentage')::numeric), 0)
    into row_count, distinct_count, total
  from jsonb_array_elements(p_rows) item;
  if row_count < 1 or row_count <> distinct_count or abs(total - 100) > 0.005 then
    raise exception 'Property share plan must contain unique rows and total 100 percent';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    left join public.partners p on p.id = (item->>'partnerId')::uuid
    where p.id is null or p.workspace_owner_id <> p_workspace_owner_id or not p.is_active
  ) then
    raise exception 'Share plans may only use active partners in the same workspace';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) item
    where (item->>'percentage')::numeric < 0 or (item->>'percentage')::numeric > 100
  ) then
    raise exception 'Partner percentages must be between 0 and 100';
  end if;

  if p_effective_from < current_date then
    raise exception 'Past share plans cannot be replaced';
  end if;

  -- The same date is an explicit replacement. Existing effective/history rows
  -- remain untouched because only an exact future plan is removed here.
  if exists (select 1 from public.partner_property_shares where property_id = p_property_id and effective_from = p_effective_from and p_effective_from > current_date) then
    delete from public.partner_property_shares where property_id = p_property_id and effective_from = p_effective_from;
  end if;

  update public.partner_property_shares
  set effective_to = p_effective_from - 1
  where property_id = p_property_id
    and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.partner_property_shares (workspace_owner_id, property_id, partner_id, percentage, effective_from)
  select p_workspace_owner_id, p_property_id, (item->>'partnerId')::uuid, (item->>'percentage')::numeric, p_effective_from
  from jsonb_array_elements(p_rows) item;

  return query select * from public.partner_property_shares
    where property_id = p_property_id and effective_from = p_effective_from
    order by partner_id;
end $$;

create or replace function public.cancel_future_partner_share_plan(
  p_workspace_owner_id uuid,
  p_property_id uuid,
  p_effective_from date
)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if p_effective_from <= current_date then
    raise exception 'Only future share plans can be cancelled';
  end if;
  if not exists (select 1 from public.properties where id = p_property_id and user_id = p_workspace_owner_id) then
    raise exception 'Property does not belong to workspace';
  end if;
  if not exists (select 1 from public.partner_property_shares where property_id = p_property_id and effective_from = p_effective_from) then
    raise exception 'Future share plan does not exist';
  end if;
  delete from public.partner_property_shares where property_id = p_property_id and effective_from = p_effective_from;
  perform app_private.rebuild_partner_share_intervals(p_property_id);
end $$;

create or replace function public.deactivate_partner_with_future_cleanup(
  p_workspace_owner_id uuid,
  p_partner_id uuid,
  p_cancel_future_plans boolean
)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  affected record;
begin
  if not exists (select 1 from public.partners where id = p_partner_id and workspace_owner_id = p_workspace_owner_id) then
    raise exception 'Partner does not belong to workspace';
  end if;
  if (select is_active from public.partners where id = p_partner_id) = false then
    return;
  end if;
  if (select count(*) from public.partners where workspace_owner_id = p_workspace_owner_id and is_active) <= 1 then
    raise exception 'A workspace must keep at least one active partner';
  end if;
  if exists (select 1 from public.partner_property_shares where partner_id = p_partner_id and effective_from > current_date) and not p_cancel_future_plans then
    raise exception 'Partner has future share plans that require confirmation';
  end if;

  create temporary table if not exists _partner_affected_properties(property_id uuid primary key) on commit drop;
  truncate _partner_affected_properties;
  insert into _partner_affected_properties
  select distinct property_id from public.partner_property_shares where partner_id = p_partner_id and effective_from > current_date;
  if p_cancel_future_plans then
    delete from public.partner_property_shares s
    where s.effective_from > current_date
      and exists (select 1 from _partner_affected_properties a where a.property_id = s.property_id);
    for affected in select property_id from _partner_affected_properties loop
      perform app_private.rebuild_partner_share_intervals(affected.property_id);
    end loop;
  end if;
  update public.partners set is_active = false where id = p_partner_id and workspace_owner_id = p_workspace_owner_id;
end $$;

create or replace function public.delete_partner_with_future_cleanup(
  p_workspace_owner_id uuid,
  p_partner_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  affected record;
begin
  if not exists (select 1 from public.partners where id = p_partner_id and workspace_owner_id = p_workspace_owner_id) then
    raise exception 'Partner does not belong to workspace';
  end if;
  if (select legacy_code from public.partners where id = p_partner_id) is not null then
    raise exception 'Legacy partners cannot be deleted';
  end if;
  if (select linked_account_id from public.partners where id = p_partner_id) is not null then
    raise exception 'Account-linked partners cannot be deleted';
  end if;
  if exists (select 1 from public.partner_property_shares where partner_id = p_partner_id and effective_from <= current_date) then
    raise exception 'Partner has effective or historical share plans';
  end if;

  create temporary table if not exists _partner_delete_properties(property_id uuid primary key) on commit drop;
  truncate _partner_delete_properties;
  insert into _partner_delete_properties
  select distinct property_id from public.partner_property_shares where partner_id = p_partner_id and effective_from > current_date;
  delete from public.partner_property_shares where partner_id = p_partner_id and effective_from > current_date;
  for affected in select property_id from _partner_delete_properties loop
    perform app_private.rebuild_partner_share_intervals(affected.property_id);
  end loop;
  delete from public.partners where id = p_partner_id and workspace_owner_id = p_workspace_owner_id;
end $$;

revoke all on function public.cancel_future_partner_share_plan(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.cancel_future_partner_share_plan(uuid, uuid, date) to service_role;
revoke all on function public.deactivate_partner_with_future_cleanup(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.deactivate_partner_with_future_cleanup(uuid, uuid, boolean) to service_role;
revoke all on function public.delete_partner_with_future_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_partner_with_future_cleanup(uuid, uuid) to service_role;
