alter table public.rent_payments
  add column if not exists received_by text not null default 'A';

alter table public.expenses
  add column if not exists paid_by text not null default 'A';

update public.rent_payments
set received_by = 'A'
where received_by is null or btrim(received_by) = '';

update public.expenses
set paid_by = 'A'
where paid_by is null or btrim(paid_by) = '';

comment on column public.rent_payments.received_by is 'Partner code that received the rent payment, for example A or B.';
comment on column public.expenses.paid_by is 'Partner code that paid or advanced this expense, for example A or B.';
