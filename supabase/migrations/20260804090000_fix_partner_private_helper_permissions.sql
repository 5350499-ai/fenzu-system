-- The public lifecycle RPCs are invoked by the server service role. The
-- interval rebuild helper stays private and is callable only by service_role.
-- It does not accept user-controlled SQL or resolve unqualified objects.
create or replace function app_private.rebuild_partner_share_intervals(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

revoke all on function app_private.rebuild_partner_share_intervals(uuid) from public, anon, authenticated;
grant execute on function app_private.rebuild_partner_share_intervals(uuid) to service_role;
