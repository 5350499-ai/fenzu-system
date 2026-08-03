-- A future plan is atomic: deleting its only test participant must cancel the
-- whole future plan, otherwise the remaining rows would no longer total 100%.
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
  delete from public.partner_property_shares s
  where s.effective_from > current_date
    and exists (select 1 from _partner_delete_properties a where a.property_id = s.property_id);
  for affected in select property_id from _partner_delete_properties loop
    perform app_private.rebuild_partner_share_intervals(affected.property_id);
  end loop;
  delete from public.partners where id = p_partner_id and workspace_owner_id = p_workspace_owner_id;
end $$;

revoke all on function public.delete_partner_with_future_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_partner_with_future_cleanup(uuid, uuid) to service_role;
