-- The tenant masking RPC is intentionally available only to signed-in users.
-- Its body applies active-session, module, property and sensitive-field checks.

revoke all on function public.get_authorized_tenants() from public;
revoke all on function public.get_authorized_tenants() from anon;
grant execute on function public.get_authorized_tenants() to authenticated;
