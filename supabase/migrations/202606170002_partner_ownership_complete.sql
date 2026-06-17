alter table public.rent_payments
  add column if not exists received_by text not null default 'A';

alter table public.expenses
  add column if not exists paid_by text not null default 'A';

alter table public.deposits
  add column if not exists received_by text not null default 'A',
  add column if not exists paid_by text not null default 'A';

update public.rent_payments
set received_by = 'A'
where received_by is null or btrim(received_by) = '';

update public.expenses
set paid_by = 'A'
where paid_by is null or btrim(paid_by) = '';

update public.deposits
set received_by = 'A'
where received_by is null or btrim(received_by) = '';

update public.deposits
set paid_by = 'A'
where paid_by is null or btrim(paid_by) = '';

do $$
declare
  table_name text;
begin
  foreach table_name in array array['advance_receipts', 'pre_receipts', 'advance_payments', 'pre_payments']
  loop
    if to_regclass('public.' || table_name) is not null then
      if table_name in ('advance_receipts', 'pre_receipts') then
        execute format('alter table public.%I add column if not exists received_by text not null default ''A''', table_name);
        execute format('update public.%I set received_by = ''A'' where received_by is null or btrim(received_by) = ''''', table_name);
      else
        execute format('alter table public.%I add column if not exists paid_by text not null default ''A''', table_name);
        execute format('update public.%I set paid_by = ''A'' where paid_by is null or btrim(paid_by) = ''''', table_name);
      end if;
    end if;
  end loop;
end $$;

comment on column public.rent_payments.received_by is 'Partner code that received income, for example A or B.';
comment on column public.expenses.paid_by is 'Partner code that paid or advanced expense, for example A or B.';
comment on column public.deposits.received_by is 'Partner code that received deposit/prepaid cash, for example A or B.';
comment on column public.deposits.paid_by is 'Partner code that returned or advanced deposit/prepaid cash, for example A or B.';

select
  table_name,
  column_name,
  data_type,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'rent_payments' and column_name = 'received_by')
    or (table_name = 'expenses' and column_name = 'paid_by')
    or (table_name = 'deposits' and column_name in ('received_by', 'paid_by'))
    or (table_name in ('advance_receipts', 'pre_receipts') and column_name = 'received_by')
    or (table_name in ('advance_payments', 'pre_payments') and column_name = 'paid_by')
  )
order by table_name, column_name;
