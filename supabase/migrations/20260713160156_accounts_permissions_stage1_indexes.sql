-- Cover the remaining Phase 1 foreign keys reported by the database advisor.

create index if not exists idx_user_profiles_created_by
  on public.user_profiles (created_by);
create index if not exists idx_user_profiles_updated_by
  on public.user_profiles (updated_by);
create index if not exists idx_user_profiles_disabled_by
  on public.user_profiles (disabled_by);
create index if not exists idx_user_property_access_created_by
  on public.user_property_access (created_by);
create index if not exists idx_app_sessions_workspace_owner
  on public.app_sessions (workspace_owner_id);
create index if not exists idx_app_sessions_revoked_by
  on public.app_sessions (revoked_by);
