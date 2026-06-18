-- Classify receipts without changing or deleting existing payment records.
alter table public.rent_payments
  add column if not exists income_type text not null default '房租收入',
  add column if not exists income_item text;

update public.rent_payments
set income_type = '房租收入'
where income_type is null or btrim(income_type) = '';

comment on column public.rent_payments.income_type is
  'Receipt type: 房租收入, 押金收入, 赔偿收入, or 其他收入.';

comment on column public.rent_payments.income_item is
  'Optional compensation or other income item description.';
