-- Cover the foreign keys used by atomic check-in idempotency records.
-- This migration changes no business rows.

begin;

create index if not exists check_in_requests_actor_user_id_idx
  on public.check_in_requests (actor_user_id);
create index if not exists check_in_requests_workspace_owner_id_idx
  on public.check_in_requests (workspace_owner_id);
create index if not exists check_in_requests_tenant_id_idx
  on public.check_in_requests (tenant_id);
create index if not exists check_in_requests_contract_id_idx
  on public.check_in_requests (contract_id);
create index if not exists check_in_requests_rent_payment_id_idx
  on public.check_in_requests (rent_payment_id);
create index if not exists check_in_requests_deposit_id_idx
  on public.check_in_requests (deposit_id);

commit;

-- Rollback:
-- drop index if exists public.check_in_requests_actor_user_id_idx;
-- drop index if exists public.check_in_requests_workspace_owner_id_idx;
-- drop index if exists public.check_in_requests_tenant_id_idx;
-- drop index if exists public.check_in_requests_contract_id_idx;
-- drop index if exists public.check_in_requests_rent_payment_id_idx;
-- drop index if exists public.check_in_requests_deposit_id_idx;
