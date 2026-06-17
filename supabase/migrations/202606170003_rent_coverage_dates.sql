alter table public.rent_payments
  add column if not exists coverage_start_date date,
  add column if not exists coverage_end_date date;

update public.rent_payments
set
  coverage_start_date = coalesce(coverage_start_date, rent_month),
  coverage_end_date = coalesce(
    coverage_end_date,
    (date_trunc('month', rent_month)::date + interval '1 month - 1 day')::date
  )
where rent_month is not null;

create index if not exists idx_rent_payments_coverage_end
  on public.rent_payments(user_id, coverage_end_date);

comment on column public.rent_payments.amount_due is 'Reference monthly rent amount. Actual income and profit use amount_paid.';
comment on column public.rent_payments.amount_paid is 'Actual received amount. Used for income, profit, and partner settlement.';
comment on column public.rent_payments.coverage_start_date is 'Manual rent coverage start date.';
comment on column public.rent_payments.coverage_end_date is 'Manual rent coverage end date. Reminders use this date.';
