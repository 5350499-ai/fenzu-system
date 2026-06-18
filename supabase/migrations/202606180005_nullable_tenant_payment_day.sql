alter table public.tenants
  alter column payment_day drop not null,
  alter column payment_day drop default;

alter table public.tenants
  drop constraint if exists tenants_payment_day_check;

alter table public.tenants
  add constraint tenants_payment_day_check
  check (payment_day is null or payment_day between 1 and 31);

comment on column public.tenants.payment_day is
  'Optional monthly rent reminder day. Null means no fixed payment day; otherwise 1 through 31.';
