begin;

-- Keep the tenant authorization boundary and sensitive-field masking intact,
-- while returning the complete public.tenants composite row after the
-- occupant_count column was added.
create or replace function public.get_authorized_tenants()
returns setof public.tenants
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.user_id, t.property_id, t.room_id, t.name,
    case when app_private.has_sensitive_permission('view_tenant_phone') then t.phone when t.phone is null then null else '*** *** ' || right(regexp_replace(t.phone,'\s','','g'),3) end,
    t.email,
    case when app_private.has_sensitive_permission('view_tenant_wechat') then t.wechat when t.wechat is null then null else '***' end,
    t.source, t.monthly_rent, t.deposit_amount, t.status,
    case when app_private.has_sensitive_permission('view_tenant_notes') then t.notes else null end,
    t.created_at, t.updated_at, t.payment_day, t.actual_move_out_date,
    t.occupant_count
  from public.tenants t
  where app_private.is_app_session_valid()
    and t.user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('tenants','view')
    and app_private.can_access_property(t.property_id);
$$;

grant select (id,user_id,property_id,room_id,name,email,source,monthly_rent,deposit_amount,status,created_at,updated_at,payment_day,actual_move_out_date,occupant_count)
  on public.tenants to authenticated;

commit;
