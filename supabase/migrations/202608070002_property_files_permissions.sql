-- Align the additive property attachment policies with the existing workspace
-- and attachment permission model. No rows or Storage objects are changed.
drop policy if exists property_files_select_own on public.property_files;
drop policy if exists property_files_insert_own on public.property_files;
drop policy if exists property_files_update_own on public.property_files;
drop policy if exists property_files_delete_own on public.property_files;

create policy property_files_select_workspace on public.property_files
  for select using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'view')
    and app_private.can_access_property(property_id)
  );
create policy property_files_insert_workspace on public.property_files
  for insert with check (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'create')
    and app_private.can_access_property(property_id)
  );
create policy property_files_update_workspace on public.property_files
  for update using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'edit')
    and app_private.can_access_property(property_id)
  ) with check (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.can_access_property(property_id)
  );
create policy property_files_delete_workspace on public.property_files
  for delete using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and app_private.has_module_permission('attachments', 'delete')
    and app_private.can_access_property(property_id)
  );

drop policy if exists property_files_storage_select_own on storage.objects;
drop policy if exists property_files_storage_insert_own on storage.objects;
drop policy if exists property_files_storage_update_own on storage.objects;
drop policy if exists property_files_storage_delete_own on storage.objects;

create policy property_files_storage_select_workspace on storage.objects
  for select using (
    bucket_id = 'property-files'
    and (storage.foldername(name))[1] = app_private.current_workspace_owner_id()::text
    and app_private.is_app_session_valid()
    and app_private.has_module_permission('attachments', 'view')
  );
create policy property_files_storage_insert_workspace on storage.objects
  for insert with check (
    bucket_id = 'property-files'
    and (storage.foldername(name))[1] = app_private.current_workspace_owner_id()::text
    and app_private.is_app_session_valid()
    and app_private.has_module_permission('attachments', 'create')
  );
create policy property_files_storage_update_workspace on storage.objects
  for update using (
    bucket_id = 'property-files'
    and (storage.foldername(name))[1] = app_private.current_workspace_owner_id()::text
    and app_private.is_app_session_valid()
    and app_private.has_module_permission('attachments', 'edit')
  ) with check (
    bucket_id = 'property-files'
    and (storage.foldername(name))[1] = app_private.current_workspace_owner_id()::text
    and app_private.is_app_session_valid()
    and app_private.has_module_permission('attachments', 'edit')
  );
create policy property_files_storage_delete_workspace on storage.objects
  for delete using (
    bucket_id = 'property-files'
    and (storage.foldername(name))[1] = app_private.current_workspace_owner_id()::text
    and app_private.is_app_session_valid()
    and app_private.has_module_permission('attachments', 'delete')
  );
