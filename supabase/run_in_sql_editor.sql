-- V1 Supabase schema for fenzu-system.
-- Run this whole file in Supabase SQL Editor.
-- Non-destructive migration: no DROP TABLE, no TRUNCATE TABLE.

create extension if not exists "pgcrypto";

create table if not exists public.landlords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  wechat text,
  email text,
  bank_account text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  landlord_id uuid references public.landlords(id),
  landlord_name text,
  name text not null,
  address text,
  city text,
  property_type text,
  sublet_allowed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id),
  name text not null,
  room_number text,
  monthly_rent numeric not null default 0,
  deposit_amount numeric not null default 0,
  status text not null default 'vacant',
  area numeric,
  has_window boolean not null default false,
  has_private_bathroom boolean not null default false,
  furniture text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id),
  room_id uuid not null references public.rooms(id),
  name text not null,
  phone text,
  email text,
  wechat text,
  whatsapp text,
  passport_number text,
  nie_number text,
  nationality text,
  source text,
  move_in_date date,
  expected_move_out_date date,
  actual_move_out_date date,
  monthly_rent numeric not null default 0,
  deposit_amount numeric not null default 0,
  key_count integer not null default 0,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_type text not null default 'tenant_contract',
  property_id uuid not null references public.properties(id),
  room_id uuid references public.rooms(id),
  tenant_id uuid references public.tenants(id),
  landlord_id uuid references public.landlords(id),
  monthly_rent numeric not null default 0,
  deposit_amount numeric not null default 0,
  start_date date,
  end_date date,
  is_signed boolean not null default false,
  is_active boolean not null default true,
  status text not null default 'active',
  file_url text,
  storage_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  property_id uuid not null references public.properties(id),
  room_id uuid not null references public.rooms(id),
  rent_month date not null,
  amount_due numeric not null default 0,
  amount_paid numeric not null default 0,
  amount_unpaid numeric not null default 0,
  payment_date date,
  payment_method text,
  is_overdue boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id),
  expense_month date not null,
  category text not null,
  amount numeric not null default 0,
  payment_date date,
  is_paid boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  property_id uuid not null references public.properties(id),
  room_id uuid not null references public.rooms(id),
  transaction_type text not null,
  amount numeric not null default 0,
  transaction_date date,
  status text not null default 'collected',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.utility_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id),
  bill_month date not null,
  electricity_amount numeric not null default 0,
  water_amount numeric not null default 0,
  gas_amount numeric not null default 0,
  internet_amount numeric not null default 0,
  total_amount numeric not null default 0,
  allocation_method text,
  payment_date date,
  is_paid boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.utility_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  utility_bill_id uuid not null references public.utility_bills(id),
  property_id uuid not null references public.properties(id),
  room_id uuid references public.rooms(id),
  tenant_id uuid references public.tenants(id),
  allocated_amount numeric not null default 0,
  is_charged_to_tenant boolean not null default true,
  is_paid_by_tenant boolean not null default false,
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null default 'manual',
  title text not null,
  description text,
  due_date date,
  status text not null default 'pending',
  priority text not null default 'normal',
  property_id uuid references public.properties(id),
  room_id uuid references public.rooms(id),
  tenant_id uuid references public.tenants(id),
  contract_id uuid references public.contracts(id),
  rent_payment_id uuid references public.rent_payments(id),
  deposit_id uuid references public.deposits(id),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  property_id uuid references public.properties(id),
  room_id uuid references public.rooms(id),
  note_type text,
  content text not null,
  contact_method text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id),
  property_id uuid references public.properties(id),
  room_id uuid references public.rooms(id),
  file_type text not null,
  file_name text not null,
  file_url text,
  storage_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.landlords enable row level security;
alter table public.properties enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.contracts enable row level security;
alter table public.rent_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.deposits enable row level security;
alter table public.utility_bills enable row level security;
alter table public.utility_allocations enable row level security;
alter table public.tasks enable row level security;
alter table public.tenant_notes enable row level security;
alter table public.tenant_documents enable row level security;

create index if not exists idx_properties_user_id on public.properties(user_id);
create index if not exists idx_rooms_property_id on public.rooms(property_id);
create index if not exists idx_rooms_user_id on public.rooms(user_id);
create index if not exists idx_tenants_property_room on public.tenants(property_id, room_id);
create index if not exists idx_tenants_user_id on public.tenants(user_id);
create index if not exists idx_contracts_property on public.contracts(property_id);
create index if not exists idx_contracts_user_id on public.contracts(user_id);
create index if not exists idx_rent_payments_property_month on public.rent_payments(property_id, rent_month);
create index if not exists idx_rent_payments_user_id on public.rent_payments(user_id);
create index if not exists idx_expenses_property_month on public.expenses(property_id, expense_month);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_deposits_property on public.deposits(property_id);
create index if not exists idx_deposits_user_id on public.deposits(user_id);
create index if not exists idx_tasks_user_id on public.tasks(user_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'landlords',
    'properties',
    'rooms',
    'tenants',
    'contracts',
    'rent_payments',
    'expenses',
    'deposits',
    'utility_bills',
    'utility_allocations',
    'tasks',
    'tenant_notes',
    'tenant_documents'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'Users can manage own rows'
    ) then
      execute format(
        'create policy "Users can manage own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t
      );
    end if;
  end loop;
end $$;
