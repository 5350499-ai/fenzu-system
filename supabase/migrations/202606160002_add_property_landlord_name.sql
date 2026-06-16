-- Add a compatibility field used by the current V1 property form.
-- Non-destructive migration: no DROP TABLE, no TRUNCATE TABLE.

alter table public.properties
  add column if not exists landlord_name text;
