-- V1 frozen schema draft for Supabase/PostgreSQL.
-- Execute after creating a Supabase project.

create extension if not exists "uuid-ossp";

create table if not exists landlords (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  name text not null,
  phone text,
  wechat text,
  email text,
  bank_account text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists properties (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  landlord_id uuid references landlords(id),
  name text not null,
  address text,
  city text,
  property_type text,
  sublet_allowed boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists rooms (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  property_id uuid references properties(id),
  name text not null,
  room_number text,
  monthly_rent numeric default 0,
  deposit_amount numeric default 0,
  status text default 'vacant',
  area numeric,
  has_window boolean default false,
  has_private_bathroom boolean default false,
  furniture text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  property_id uuid references properties(id),
  room_id uuid references rooms(id),
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
  monthly_rent numeric default 0,
  deposit_amount numeric default 0,
  key_count integer default 0,
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  contract_type text not null,
  property_id uuid references properties(id),
  room_id uuid references rooms(id),
  tenant_id uuid references tenants(id),
  landlord_id uuid references landlords(id),
  monthly_rent numeric default 0,
  deposit_amount numeric default 0,
  start_date date,
  end_date date,
  is_signed boolean default false,
  is_active boolean default true,
  file_url text,
  storage_path text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists rent_payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  tenant_id uuid references tenants(id),
  property_id uuid references properties(id),
  room_id uuid references rooms(id),
  rent_month date not null,
  amount_due numeric default 0,
  amount_paid numeric default 0,
  amount_unpaid numeric default 0,
  payment_date date,
  payment_method text,
  is_overdue boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
