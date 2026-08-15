-- Additive scheduler/health foundation. Production activation is intentionally separate.
alter table public.account_recovery_points add column if not exists schedule_slot text;
create unique index if not exists account_recovery_points_scheduled_slot_unique
  on public.account_recovery_points (workspace_owner_id, schedule_slot)
  where source = 'scheduled' and schedule_slot is not null;

create table if not exists public.account_recovery_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_slot text not null unique,
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  workspace_count integer not null default 0 check (workspace_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  error_summary text
);
alter table public.account_recovery_scheduler_runs enable row level security;
revoke all on table public.account_recovery_scheduler_runs from anon, authenticated;
grant all on table public.account_recovery_scheduler_runs to service_role;
create index if not exists account_recovery_scheduler_runs_started_idx
  on public.account_recovery_scheduler_runs (started_at desc);
