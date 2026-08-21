begin;

-- The permission trigger is invoked by PostgreSQL triggers only. It is not a
-- client-callable RPC and must not retain the default PUBLIC EXECUTE grant.
revoke all on function app_private.enforce_business_update_permission() from public, anon, authenticated, service_role;

-- Move-out is authenticated application traffic. No service-role call site
-- exists, so keep the RPC limited to authenticated sessions.
revoke all on function public.move_out_tenant_atomic(uuid, text, date) from public, anon, service_role;
grant execute on function public.move_out_tenant_atomic(uuid, text, date) to authenticated;

commit;
