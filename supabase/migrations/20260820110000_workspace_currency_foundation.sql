alter table public.user_profiles
  add column if not exists currency_code text not null default 'EUR';

alter table public.user_profiles
  drop constraint if exists user_profiles_currency_code_check;

alter table public.user_profiles
  add constraint user_profiles_currency_code_check
  check (currency_code in ('EUR', 'USD', 'GBP', 'CNY', 'JPY'));

comment on column public.user_profiles.currency_code is
  'Canonical workspace display currency stored on the workspace owner profile. Amounts are never converted.';
