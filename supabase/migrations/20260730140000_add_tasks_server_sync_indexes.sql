-- Design only: the existing public.tasks table is reused. This migration has
-- not been executed because Preview and Production may share a database.
-- It adds lookup indexes only; it does not create a duplicate tasks table,
-- change task rows, alter RLS, or broaden permissions.
create index if not exists tasks_tenant_status_idx
  on public.tasks (tenant_id, status);

create index if not exists tasks_due_date_idx
  on public.tasks (due_date);
