begin;

-- Prerequisite: 20260730120000_add_actual_move_out_date.sql. This migration
-- records future administrator-requested cleanup/archive work only; it never
-- changes business records through foreign-key cascades.
create table if not exists public.attachment_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  threshold_months integer not null check (threshold_months in (3, 6)),
  status text not null check (status in ('preview', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  candidate_tenant_count integer not null default 0 check (candidate_tenant_count >= 0),
  candidate_attachment_count integer not null default 0 check (candidate_attachment_count >= 0),
  candidate_total_bytes bigint not null default 0 check (candidate_total_bytes >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  notes text
);

create table if not exists public.attachment_cleanup_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.attachment_cleanup_runs(id) on delete restrict,
  attachment_type text not null check (attachment_type in ('contract', 'rent_payment')),
  source_table text not null check (source_table in ('contract_files', 'rent_payment_files')),
  source_record_id uuid not null,
  attachment_id uuid not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  bucket text not null,
  storage_path text not null,
  file_name text not null,
  file_size bigint not null check (file_size >= 0),
  status text not null check (status in ('preview', 'eligible', 'skipped', 'running', 'deleted', 'missing', 'failed')),
  skip_reason text,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Archive metadata is separate from cleanup and never grants public object access.
create table if not exists public.attachment_archive_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  threshold_months integer check (threshold_months in (3, 6)),
  status text not null check (status in ('preview', 'queued', 'running', 'completed', 'failed', 'expired', 'cancelled')),
  candidate_tenant_count integer not null default 0 check (candidate_tenant_count >= 0),
  candidate_attachment_count integer not null default 0 check (candidate_attachment_count >= 0),
  candidate_total_bytes bigint not null default 0 check (candidate_total_bytes >= 0),
  archive_bucket text,
  archive_path text,
  expires_at timestamptz,
  error_message text,
  completed_at timestamptz
);

create index if not exists attachment_cleanup_runs_created_at_idx on public.attachment_cleanup_runs (created_at desc);
create index if not exists attachment_cleanup_items_run_id_idx on public.attachment_cleanup_items (run_id);
create index if not exists attachment_cleanup_items_attachment_idx on public.attachment_cleanup_items (source_table, attachment_id);
create index if not exists attachment_archive_runs_created_at_idx on public.attachment_archive_runs (created_at desc);

alter table public.attachment_cleanup_runs enable row level security;
alter table public.attachment_cleanup_items enable row level security;
alter table public.attachment_archive_runs enable row level security;

revoke all on table public.attachment_cleanup_runs, public.attachment_cleanup_items, public.attachment_archive_runs from anon, authenticated;
grant select, insert, update, delete on table public.attachment_cleanup_runs, public.attachment_cleanup_items, public.attachment_archive_runs to service_role;

comment on table public.attachment_cleanup_runs is 'Server-only audit trail for future manually confirmed attachment cleanup runs.';
comment on table public.attachment_cleanup_items is 'Server-only per-attachment cleanup audit; no FK cascades to business records.';
comment on table public.attachment_archive_runs is 'Server-only metadata for future private, expiring attachment ZIP archives.';

commit;
