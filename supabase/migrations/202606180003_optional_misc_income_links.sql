-- Compensation and other receipts may exist without a property, room, or tenant.
-- Existing foreign keys and all historical rows are preserved.
alter table public.rent_payments
  alter column property_id drop not null,
  alter column room_id drop not null,
  alter column tenant_id drop not null;

comment on column public.rent_payments.property_id is
  'Required for rent/deposit receipts; optional for compensation and other receipts.';
comment on column public.rent_payments.room_id is
  'Required for rent/deposit receipts; optional for compensation and other receipts.';
comment on column public.rent_payments.tenant_id is
  'Required for rent/deposit receipts; optional for compensation and other receipts.';
