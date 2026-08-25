-- Restore permission correction only. Preserve the existing 18-table boundary,
-- strict workspace binding, request validation, ordering and transaction.

create or replace function public.restore_workspace_backup(
  p_workspace_owner_id uuid,
  p_actor_account_id uuid,
  p_data jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_count integer;
begin
  if not exists (
    select 1 from public.user_profiles
    where auth_user_id = p_actor_account_id
      and workspace_owner_id = p_workspace_owner_id
      and status = 'active'
      and (
        account_type = 'owner'
        or (account_type = 'custom' and account_plan = 'free_single' and auth_user_id = workspace_owner_id)
      )
  ) then
    raise exception 'Only an active workspace owner may restore a backup' using errcode = '42501';
  end if;

  if p_data->>'sourceWorkspaceId' is distinct from p_workspace_owner_id::text then
    raise exception 'Restore blocked: source workspace does not match target workspace' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_data->'checkInRequests', '[]'::jsonb)) as r(
      client_request_id uuid, actor_user_id uuid, workspace_owner_id uuid,
      tenant_id uuid, contract_id uuid, rent_payment_id uuid, deposit_id uuid
    )
    where r.client_request_id is null
       or r.workspace_owner_id is distinct from p_workspace_owner_id
       or not exists (select 1 from public.user_profiles u where u.auth_user_id = r.actor_user_id and u.workspace_owner_id = p_workspace_owner_id)
       or (r.tenant_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'tenants', '[]'::jsonb)) x where (x->>'id')::uuid = r.tenant_id))
       or (r.contract_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'contracts', '[]'::jsonb)) x where (x->>'id')::uuid = r.contract_id))
       or (r.rent_payment_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'rentPayments', '[]'::jsonb)) x where (x->>'id')::uuid = r.rent_payment_id))
       or (r.deposit_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'deposits', '[]'::jsonb)) x where (x->>'id')::uuid = r.deposit_id))
  ) then
    raise exception 'Restore blocked: check-in request reference graph is incomplete or cross-workspace' using errcode = '23503';
  end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_data->'checkInRequests', '[]'::jsonb)) as r(client_request_id uuid) group by r.client_request_id having count(*) > 1) then
    raise exception 'Restore blocked: duplicate check-in client_request_id' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_data->'tenantCreateRequests', '[]'::jsonb)) as r(
      client_request_id uuid, actor_user_id uuid, workspace_owner_id uuid,
      tenant_id uuid, contract_id uuid, rent_payment_id uuid, deposit_id uuid
    )
    where r.client_request_id is null
       or r.workspace_owner_id is distinct from p_workspace_owner_id
       or not exists (select 1 from public.user_profiles u where u.auth_user_id = r.actor_user_id and u.workspace_owner_id = p_workspace_owner_id)
       or (r.tenant_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'tenants', '[]'::jsonb)) x where (x->>'id')::uuid = r.tenant_id))
       or (r.contract_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'contracts', '[]'::jsonb)) x where (x->>'id')::uuid = r.contract_id))
       or (r.rent_payment_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'rentPayments', '[]'::jsonb)) x where (x->>'id')::uuid = r.rent_payment_id))
       or (r.deposit_id is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'deposits', '[]'::jsonb)) x where (x->>'id')::uuid = r.deposit_id))
  ) then
    raise exception 'Restore blocked: tenant-create request reference graph is incomplete or cross-workspace' using errcode = '23503';
  end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_data->'tenantCreateRequests', '[]'::jsonb)) as r(client_request_id uuid) group by r.client_request_id having count(*) > 1) then
    raise exception 'Restore blocked: duplicate tenant-create client_request_id' using errcode = '23505';
  end if;

  perform set_config('app.restore_mode', 'on', true);
  delete from public.check_in_requests where workspace_owner_id = p_workspace_owner_id;
  delete from public.tenant_create_requests where workspace_owner_id = p_workspace_owner_id;
  perform public.restore_workspace_backup_impl(p_workspace_owner_id, p_actor_account_id, p_data);
  insert into public.check_in_requests select * from jsonb_populate_recordset(null::public.check_in_requests, coalesce(p_data->'checkInRequests', '[]'::jsonb));
  insert into public.tenant_create_requests select * from jsonb_populate_recordset(null::public.tenant_create_requests, coalesce(p_data->'tenantCreateRequests', '[]'::jsonb));

  select count(*) into v_request_count from public.check_in_requests where workspace_owner_id = p_workspace_owner_id;
  if v_request_count <> jsonb_array_length(coalesce(p_data->'checkInRequests', '[]'::jsonb)) then raise exception 'Restore validation failed: check-in request count mismatch' using errcode = '23514'; end if;
  select count(*) into v_request_count from public.tenant_create_requests where workspace_owner_id = p_workspace_owner_id;
  if v_request_count <> jsonb_array_length(coalesce(p_data->'tenantCreateRequests', '[]'::jsonb)) then raise exception 'Restore validation failed: tenant-create request count mismatch' using errcode = '23514'; end if;

  if exists (select 1 from jsonb_array_elements(coalesce(p_data->'checkInRequests', '[]'::jsonb)) x where not exists (select 1 from public.check_in_requests r where r.client_request_id = (x->>'client_request_id')::uuid and (to_jsonb(r) - 'created_at' - 'completed_at') = (x - 'created_at' - 'completed_at'))) then
    raise exception 'Restore validation failed: check-in request fields do not match' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_data->'tenantCreateRequests', '[]'::jsonb)) x where not exists (select 1 from public.tenant_create_requests r where r.client_request_id = (x->>'client_request_id')::uuid and (to_jsonb(r) - 'created_at' - 'completed_at') = (x - 'created_at' - 'completed_at'))) then
    raise exception 'Restore validation failed: tenant-create request fields do not match' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.restore_workspace_backup(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup(uuid, uuid, jsonb) to service_role;
