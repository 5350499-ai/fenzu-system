-- Property-level occupancy denominator start. Existing rows remain NULL;
-- the application derives a non-persistent default until the owner saves it.
alter table public.properties
  add column if not exists occupancy_tracking_start_date date null;
