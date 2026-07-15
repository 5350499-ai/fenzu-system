-- Phase 3: apply the existing account model to business rows, attachments and auditing.
-- Additive only: no business table/column is dropped, rebuilt or rewritten.

begin;

create or replace function app_private.enforce_business_update_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_key text := tg_argv[0];
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
  archive_words text[] := array['已归档','已退租','已结束','已作废'];
  archive_change boolean := false;
  word text;
begin
  if app_private.is_owner() then return new; end if;
  foreach word in array archive_words loop
    if coalesce(old_data->>'status','') is distinct from coalesce(new_data->>'status','')
       and (coalesce(old_data->>'status','') like '%' || word || '%' or coalesce(new_data->>'status','') like '%' || word || '%') then
      archive_change := true;
    end if;
    if coalesce(old_data->>'notes','') is distinct from coalesce(new_data->>'notes','')
       and (coalesce(old_data->>'notes','') like '%' || word || '%' or coalesce(new_data->>'notes','') like '%' || word || '%') then
      archive_change := true;
    end if;
  end loop;
  if archive_change and not app_private.has_module_permission(module_key, 'archive') then
    raise exception 'permission denied: archive';
  elsif not archive_change and not app_private.has_module_permission(module_key, 'edit') then
    raise exception 'permission denied: edit';
  end if;
  return new;
end;
$$;

create or replace function app_private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_key text := tg_argv[0];
  before_data jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_data jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  source_data jsonb := coalesce(after_data, before_data);
  actor public.user_profiles%rowtype;
  action_name text := lower(tg_op);
  entity_uuid uuid := nullif(source_data->>'id','')::uuid;
  property_uuid uuid;
begin
  select * into actor from public.user_profiles where auth_user_id = (select auth.uid());
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  property_uuid := case when tg_table_name = 'properties' then entity_uuid else nullif(source_data->>'property_id','')::uuid end;
  if tg_op = 'UPDATE' and (
    coalesce(before_data->>'status','') is distinct from coalesce(after_data->>'status','')
    or coalesce(before_data->>'notes','') is distinct from coalesce(after_data->>'notes','')
  ) and (coalesce(after_data->>'status','') ~ '归档|退租|结束|作废' or coalesce(after_data->>'notes','') ~ '归档|退租|结束|作废') then
    action_name := 'archive';
  end if;
  before_data := before_data - array['phone','wechat','passport_number','nie_number'];
  after_data := after_data - array['phone','wechat','passport_number','nie_number'];
  insert into public.audit_logs (
    log_category, actor_user_id, actor_username, actor_display_name, session_id,
    action_type, module_key, entity_type, entity_id, property_id, room_id, tenant_id,
    before_data, after_data, amount, description, success
  ) values (
    'business', actor.auth_user_id, actor.username, actor.display_name, (select auth.jwt()->>'session_id'),
    action_name, module_key, tg_table_name, entity_uuid, property_uuid,
    nullif(source_data->>'room_id','')::uuid, nullif(source_data->>'tenant_id','')::uuid,
    before_data, after_data,
    case when source_data ? 'amount_paid' then nullif(source_data->>'amount_paid','')::numeric when source_data ? 'amount' then nullif(source_data->>'amount','')::numeric else null end,
    tg_table_name || ' ' || action_name, true
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  item text[];
  table_name text;
  module_name text;
  property_expression text;
begin
  foreach item slice 1 in array array[
    array['properties','properties','id'],
    array['rooms','rooms','property_id'],
    array['tenants','tenants','property_id'],
    array['contracts','tenants','property_id'],
    array['rent_payments','rent_payments','property_id'],
    array['expenses','expenses','property_id'],
    array['deposits','deposits','property_id'],
    array['tasks','tasks','property_id'],
    array['tenant_notes','tenants','property_id']
  ] loop
    table_name := item[1]; module_name := item[2];
    property_expression := case when item[3] = 'id' then 'id' else item[3] end;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=table_name and policyname='stage3_custom_select') then
      execute format('create policy stage3_custom_select on public.%I for select to authenticated using (app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id() and app_private.has_module_permission(%L,''view'') and app_private.can_access_property(%I))', table_name, module_name, property_expression);
      execute format('create policy stage3_custom_insert on public.%I for insert to authenticated with check (app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id() and app_private.has_module_permission(%L,''create'') and app_private.can_access_property(%I))', table_name, module_name, property_expression);
      execute format('create policy stage3_custom_update on public.%I for update to authenticated using (app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id() and (app_private.has_module_permission(%L,''edit'') or app_private.has_module_permission(%L,''archive'')) and app_private.can_access_property(%I)) with check (app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id() and (app_private.has_module_permission(%L,''edit'') or app_private.has_module_permission(%L,''archive'')) and app_private.can_access_property(%I))', table_name, module_name, module_name, property_expression, module_name, module_name, property_expression);
      execute format('create policy stage3_custom_delete on public.%I for delete to authenticated using (app_private.is_app_session_valid() and user_id = app_private.current_workspace_owner_id() and app_private.has_module_permission(%L,''delete'') and app_private.can_access_property(%I))', table_name, module_name, property_expression);
    end if;
    if not exists (select 1 from pg_trigger where tgname='stage3_permission_update_' || table_name) then
      execute format('create trigger %I before update on public.%I for each row execute function app_private.enforce_business_update_permission(%L)', 'stage3_permission_update_' || table_name, table_name, module_name);
    end if;
    if not exists (select 1 from pg_trigger where tgname='stage3_audit_' || table_name) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_business_change(%L)', 'stage3_audit_' || table_name, table_name, module_name);
    end if;
  end loop;
end $$;

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
    t.created_at, t.updated_at, t.payment_day
  from public.tenants t
  where app_private.is_app_session_valid()
    and t.user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('tenants','view')
    and app_private.can_access_property(t.property_id);
$$;
revoke all on function public.get_authorized_tenants() from public;
grant execute on function public.get_authorized_tenants() to authenticated;
revoke select on public.tenants from authenticated;
grant select (id,user_id,property_id,room_id,name,email,source,monthly_rent,deposit_amount,status,created_at,updated_at,payment_day) on public.tenants to authenticated;

do $$
declare
  item text[];
  metadata_table text;
  parent_table text;
  parent_column text;
  view_permission text;
begin
  foreach item slice 1 in array array[
    array['contract_files','contracts','contract_id','view_contract_files'],
    array['rent_payment_files','rent_payments','rent_payment_id','view_rent_files'],
    array['expense_files','expenses','expense_id','view_expense_files']
  ] loop
    metadata_table:=item[1]; parent_table:=item[2]; parent_column:=item[3]; view_permission:=item[4];
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=metadata_table and policyname='stage3_custom_select') then
      execute format('create policy stage3_custom_select on public.%I for select to authenticated using (app_private.is_app_session_valid() and user_id=app_private.current_workspace_owner_id() and app_private.has_module_permission(''attachments'',''view'') and app_private.has_sensitive_permission(%L) and exists(select 1 from public.%I p where p.id=%I.%I and app_private.can_access_property(p.property_id)))',metadata_table,view_permission,parent_table,metadata_table,parent_column);
      execute format('create policy stage3_custom_insert on public.%I for insert to authenticated with check (app_private.is_app_session_valid() and user_id=app_private.current_workspace_owner_id() and app_private.has_module_permission(''attachments'',''create'') and app_private.has_sensitive_permission(''upload_files'') and exists(select 1 from public.%I p where p.id=%I.%I and app_private.can_access_property(p.property_id)))',metadata_table,parent_table,metadata_table,parent_column);
      execute format('create policy stage3_custom_update on public.%I for update to authenticated using (app_private.is_app_session_valid() and user_id=app_private.current_workspace_owner_id() and app_private.has_module_permission(''attachments'',''edit'') and app_private.has_sensitive_permission(''replace_files'') and exists(select 1 from public.%I p where p.id=%I.%I and app_private.can_access_property(p.property_id))) with check (app_private.is_app_session_valid() and user_id=app_private.current_workspace_owner_id() and app_private.has_module_permission(''attachments'',''edit'') and app_private.has_sensitive_permission(''replace_files'') and exists(select 1 from public.%I p where p.id=%I.%I and app_private.can_access_property(p.property_id)))',metadata_table,parent_table,metadata_table,parent_column,parent_table,metadata_table,parent_column);
      execute format('create policy stage3_custom_delete on public.%I for delete to authenticated using (app_private.is_app_session_valid() and user_id=app_private.current_workspace_owner_id() and app_private.has_module_permission(''attachments'',''delete'') and app_private.has_sensitive_permission(''delete_files'') and exists(select 1 from public.%I p where p.id=%I.%I and app_private.can_access_property(p.property_id)))',metadata_table,parent_table,metadata_table,parent_column);
    end if;
    if not exists (select 1 from pg_trigger where tgname='stage3_audit_' || metadata_table) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_business_change(''attachments'')','stage3_audit_' || metadata_table,metadata_table);
    end if;
  end loop;
end $$;

do $$
declare
  bucket text;
  bucket_key text;
  view_permission text;
begin
  foreach bucket in array array['contract-files','rent-payment-files','expense-files'] loop
    bucket_key := replace(bucket,'-','_');
    view_permission := case bucket when 'contract-files' then 'view_contract_files' when 'rent-payment-files' then 'view_rent_files' else 'view_expense_files' end;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='stage3_custom_' || bucket_key || '_select') then
      execute format('create policy %I on storage.objects for select to authenticated using (bucket_id=%L and (storage.foldername(name))[1]=app_private.current_workspace_owner_id()::text and app_private.is_app_session_valid() and app_private.has_module_permission(''attachments'',''view'') and app_private.has_sensitive_permission(%L))','stage3_custom_' || bucket_key || '_select',bucket,view_permission);
      execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id=%L and (storage.foldername(name))[1]=app_private.current_workspace_owner_id()::text and app_private.is_app_session_valid() and app_private.has_module_permission(''attachments'',''create'') and app_private.has_sensitive_permission(''upload_files''))','stage3_custom_' || bucket_key || '_insert',bucket);
      execute format('create policy %I on storage.objects for update to authenticated using (bucket_id=%L and (storage.foldername(name))[1]=app_private.current_workspace_owner_id()::text and app_private.is_app_session_valid() and app_private.has_module_permission(''attachments'',''edit'') and app_private.has_sensitive_permission(''replace_files'')) with check (bucket_id=%L and (storage.foldername(name))[1]=app_private.current_workspace_owner_id()::text and app_private.is_app_session_valid() and app_private.has_module_permission(''attachments'',''edit'') and app_private.has_sensitive_permission(''replace_files''))','stage3_custom_' || bucket_key || '_update',bucket,bucket);
      execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id=%L and (storage.foldername(name))[1]=app_private.current_workspace_owner_id()::text and app_private.is_app_session_valid() and app_private.has_module_permission(''attachments'',''delete'') and app_private.has_sensitive_permission(''delete_files''))','stage3_custom_' || bucket_key || '_delete',bucket);
    end if;
  end loop;
end $$;

commit;
