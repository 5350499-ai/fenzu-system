-- Atomic insertion of a future property share plan. The API still performs
-- the Owner check; this function only protects the data invariants.
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
  total numeric;
begin
  if p_effective_from is null then
    raise exception 'Share plan effective date is required';
  end if;
  if not exists (select 1 from public.properties where id = p_property_id and user_id = p_workspace_owner_id) then
    raise exception 'Property does not belong to workspace';
  end if;

  select count(*), coalesce(sum((item->>'percentage')::numeric), 0)
    into row_count, total
  from jsonb_array_elements(p_rows) item;
  if row_count < 1 or abs(total - 100) > 0.005 then
    raise exception 'Property share plan must contain at least one row and total 100 percent';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    join public.partners p on p.id = (item->>'partnerId')::uuid
    where p.workspace_owner_id <> p_workspace_owner_id or not p.is_active
  ) then
    raise exception 'Share plans may only use active partners in the same workspace';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where (item->>'percentage')::numeric < 0 or (item->>'percentage')::numeric > 100
  ) then
    raise exception 'Partner percentages must be between 0 and 100';
  end if;
  if exists (
    select 1 from public.partner_property_shares
    where property_id = p_property_id and effective_from > p_effective_from
  ) then
    raise exception 'A new share plan cannot be inserted before an existing future plan';
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

revoke all on function public.replace_partner_property_share_plan(uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_partner_property_share_plan(uuid, uuid, date, jsonb) to service_role;
