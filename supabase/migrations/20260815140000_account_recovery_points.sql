-- Additive server-owned recovery-point inventory. Payloads remain in the
-- private system-backups bucket; no historical business rows are changed.
create table if not exists public.account_recovery_points (
  id uuid primary key,
  workspace_owner_id uuid not null references auth.users(id) on delete restrict,
  source text not null check (source in ('scheduled', 'before_restore', 'before_destructive', 'manual_admin_support')),
  retention_class text not null check (retention_class in ('daily', 'weekly', 'event')),
  status text not null default 'available' check (status in ('available', 'expired', 'deleted', 'failed')),
  storage_bucket text not null default 'system-backups', storage_path text not null,
  backup_format_version integer not null check (backup_format_version > 0), schema_version text not null,
  checksum text not null, size_bytes bigint not null check (size_bytes >= 0), record_count integer not null check (record_count >= 0),
  created_at timestamptz not null default now(), expires_at timestamptz, created_by uuid references auth.users(id) on delete set null,
  constraint account_recovery_points_workspace_path_unique unique (workspace_owner_id, storage_path)
);
create index if not exists account_recovery_points_workspace_created_idx on public.account_recovery_points (workspace_owner_id, created_at desc);
create index if not exists account_recovery_points_expiry_idx on public.account_recovery_points (status, expires_at);
alter table public.account_recovery_points enable row level security;
revoke all on table public.account_recovery_points from anon, authenticated;
grant all on table public.account_recovery_points to service_role;
comment on table public.account_recovery_points is 'Server-owned account-scoped recovery point inventory; payloads live in private Storage.';
