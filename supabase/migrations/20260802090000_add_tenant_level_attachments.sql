-- Allow tenant-owned attachments without requiring a contract.
-- Existing storage objects and contract_id values are preserved.

alter table public.contract_files
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

update public.contract_files as cf
set tenant_id = c.tenant_id
from public.contracts as c
where c.id = cf.contract_id
  and cf.tenant_id is null;

do $$
begin
  if exists (
    select 1
    from public.contract_files as cf
    where cf.tenant_id is null
  ) then
    raise exception 'contract_files tenant backfill incomplete';
  end if;
  if exists (
    select 1
    from public.contract_files as cf
    join public.contracts as c on c.id = cf.contract_id
    where cf.tenant_id is distinct from c.tenant_id
  ) then
    raise exception 'contract_files tenant/contract ownership mismatch';
  end if;
end $$;

alter table public.contract_files
  alter column contract_id drop not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'contract_files_contract_id_fkey'
      and conrelid = 'public.contract_files'::regclass
  ) then
    alter table public.contract_files drop constraint contract_files_contract_id_fkey;
  end if;
  alter table public.contract_files
    add constraint contract_files_contract_id_fkey
    foreign key (contract_id) references public.contracts(id) on delete set null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contract_files_owner_required'
      and conrelid = 'public.contract_files'::regclass
  ) then
    alter table public.contract_files
      add constraint contract_files_owner_required
      check (contract_id is not null or tenant_id is not null);
  end if;
end $$;

create index if not exists contract_files_tenant_id_idx
  on public.contract_files(tenant_id);

drop policy if exists stage3_custom_select on public.contract_files;
drop policy if exists stage3_custom_insert on public.contract_files;
drop policy if exists stage3_custom_update on public.contract_files;
drop policy if exists stage3_custom_delete on public.contract_files;

create policy stage3_custom_select on public.contract_files
  for select to authenticated
  using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'view')
    and app_private.has_sensitive_permission('view_contract_files')
    and (
      exists (
        select 1 from public.contracts c
        where c.id = contract_files.contract_id
          and c.tenant_id = contract_files.tenant_id
          and app_private.can_access_property(c.property_id)
      )
      or exists (
        select 1 from public.tenants t
        where t.id = contract_files.tenant_id
          and app_private.can_access_property(t.property_id)
      )
    )
  );

create policy stage3_custom_insert on public.contract_files
  for insert to authenticated
  with check (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'create')
    and app_private.has_sensitive_permission('upload_files')
    and exists (
      select 1 from public.tenants t
      where t.id = contract_files.tenant_id
        and app_private.can_access_property(t.property_id)
    )
    and (
      contract_files.contract_id is null
      or exists (
        select 1 from public.contracts c
        where c.id = contract_files.contract_id
          and c.tenant_id = contract_files.tenant_id
          and app_private.can_access_property(c.property_id)
      )
    )
  );

create policy stage3_custom_update on public.contract_files
  for update to authenticated
  using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'edit')
    and app_private.has_sensitive_permission('replace_files')
    and (
      exists (
        select 1 from public.contracts c
        where c.id = contract_files.contract_id
          and c.tenant_id = contract_files.tenant_id
          and app_private.can_access_property(c.property_id)
      )
      or exists (
        select 1 from public.tenants t
        where t.id = contract_files.tenant_id
          and app_private.can_access_property(t.property_id)
      )
    )
  )
  with check (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and (
      exists (
        select 1 from public.contracts c
        where c.id = contract_files.contract_id
          and c.tenant_id = contract_files.tenant_id
          and app_private.can_access_property(c.property_id)
      )
      or exists (
        select 1 from public.tenants t
        where t.id = contract_files.tenant_id
          and app_private.can_access_property(t.property_id)
      )
    )
  );

create policy stage3_custom_delete on public.contract_files
  for delete to authenticated
  using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'delete')
    and app_private.has_sensitive_permission('delete_files')
    and (
      exists (
        select 1 from public.contracts c
        where c.id = contract_files.contract_id
          and c.tenant_id = contract_files.tenant_id
          and app_private.can_access_property(c.property_id)
      )
      or exists (
        select 1 from public.tenants t
        where t.id = contract_files.tenant_id
          and app_private.can_access_property(t.property_id)
      )
    )
  );
