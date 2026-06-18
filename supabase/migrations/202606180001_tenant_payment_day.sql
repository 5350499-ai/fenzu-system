-- Add the recurring rent collection day without changing existing records.
alter table public.tenants
  add column if not exists payment_day smallint not null default 20;

update public.tenants
set payment_day = 20
where payment_day is null or payment_day < 1 or payment_day > 28;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenants_payment_day_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_payment_day_check
      check (payment_day between 1 and 28);
  end if;
end $$;

comment on column public.tenants.payment_day is
  'Recurring day of month when the next rent payment should be collected (1-28).';
