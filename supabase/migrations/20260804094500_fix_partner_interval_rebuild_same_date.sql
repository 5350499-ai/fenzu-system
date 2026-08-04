-- Rebuild intervals by distinct plan dates. Multiple partners share one
-- effective_from, so treating each share row as a separate interval would
-- produce effective_to before effective_from and fail the range trigger.
create or replace function app_private.rebuild_partner_share_intervals(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with plan_dates as (
    select effective_from,
      lead(effective_from) over (order by effective_from) as next_start
    from (
      select distinct effective_from
      from public.partner_property_shares
      where property_id = p_property_id
    ) dates
  )
  update public.partner_property_shares s
  set effective_to = case
    when plan_dates.next_start is null then null
    else plan_dates.next_start - 1
  end
  from plan_dates
  where s.property_id = p_property_id
    and s.effective_from = plan_dates.effective_from;
end $$;

revoke all on function app_private.rebuild_partner_share_intervals(uuid) from public, anon, authenticated;
grant execute on function app_private.rebuild_partner_share_intervals(uuid) to service_role;
