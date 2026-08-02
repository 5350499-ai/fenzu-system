-- Viewing appointments V1. Schema-only change; no existing business rows are modified.
create table if not exists public.viewing_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  appointment_date date not null,
  appointment_time time not null,
  contact_name text,
  contact_whatsapp text,
  contact_phone text,
  status text not null default '待看房',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viewing_appointments_contact_required check (
    nullif(trim(coalesce(contact_name, '')), '') is not null
    or nullif(trim(coalesce(contact_whatsapp, '')), '') is not null
    or nullif(trim(coalesce(contact_phone, '')), '') is not null
  )
);

create index if not exists viewing_appointments_user_date_idx
  on public.viewing_appointments(user_id, appointment_date, appointment_time);

alter table public.viewing_appointments enable row level security;

drop policy if exists viewing_appointments_select on public.viewing_appointments;
create policy viewing_appointments_select on public.viewing_appointments
  for select to authenticated
  using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and (property_id is null or app_private.can_access_property(property_id))
  );

drop policy if exists viewing_appointments_insert on public.viewing_appointments;
create policy viewing_appointments_insert on public.viewing_appointments
  for insert to authenticated
  with check (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and (property_id is null or app_private.can_access_property(property_id))
  );

drop policy if exists viewing_appointments_update on public.viewing_appointments;
create policy viewing_appointments_update on public.viewing_appointments
  for update to authenticated
  using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and (property_id is null or app_private.can_access_property(property_id))
  )
  with check (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and (property_id is null or app_private.can_access_property(property_id))
  );

drop policy if exists viewing_appointments_delete on public.viewing_appointments;
create policy viewing_appointments_delete on public.viewing_appointments
  for delete to authenticated
  using (
    app_private.is_app_session_valid()
    and user_id = app_private.current_workspace_owner_id()
    and (property_id is null or app_private.can_access_property(property_id))
  );

grant select, insert, update, delete on public.viewing_appointments to authenticated;
