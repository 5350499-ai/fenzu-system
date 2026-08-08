begin;

alter table public.tenants
  add column if not exists occupant_count integer not null default 1;

alter table public.tenants
  drop constraint if exists tenants_occupant_count_check;

alter table public.tenants
  add constraint tenants_occupant_count_check check (occupant_count >= 1);

-- Keep the existing atomic check-in implementation as the trusted creator, and
-- wrap it with the new tenant occupancy value. This preserves all existing
-- financial calculations and makes the new value transactionally atomic with
-- the tenant, contract, payment, deposit, and room updates.
create or replace function public.create_atomic_check_in(
  p_client_request_id uuid,
  p_property_id uuid,
  p_room_id uuid,
  p_tenant_name text,
  p_occupant_count integer,
  p_phone text,
  p_document_number text,
  p_monthly_rent numeric,
  p_rent_amount numeric,
  p_deposit_amount numeric,
  p_payment_day smallint,
  p_payment_date date,
  p_coverage_start_date date,
  p_coverage_end_date date,
  p_contract_end_date date,
  p_deposit_status text,
  p_payment_status text,
  p_payment_method text,
  p_received_by text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_occupant_count integer := coalesce(p_occupant_count, 1);
begin
  if v_occupant_count < 1 then
    raise exception using errcode = '22023', message = 'invalid occupant count';
  end if;

  v_result := public.create_atomic_check_in(
    p_client_request_id,
    p_property_id,
    p_room_id,
    p_tenant_name,
    p_phone,
    p_document_number,
    p_monthly_rent,
    p_rent_amount,
    p_deposit_amount,
    p_payment_day,
    p_payment_date,
    p_coverage_start_date,
    p_coverage_end_date,
    p_contract_end_date,
    p_deposit_status,
    p_payment_status,
    p_payment_method,
    p_received_by,
    p_notes
  );

  update public.tenants
  set occupant_count = v_occupant_count
  where id = (v_result ->> 'tenantId')::uuid;

  return v_result || jsonb_build_object('occupantCount', v_occupant_count);
end;
$$;

revoke all on function public.create_atomic_check_in(
  uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, smallint,
  date, date, date, date, text, text, text, text, text
) from public, anon, authenticated;

revoke all on function public.create_atomic_check_in(
  uuid, uuid, uuid, text, integer, text, text, numeric, numeric, numeric,
  smallint, date, date, date, date, text, text, text, text, text
) from public, anon;

grant execute on function public.create_atomic_check_in(
  uuid, uuid, uuid, text, integer, text, text, numeric, numeric, numeric,
  smallint, date, date, date, date, text, text, text, text, text
) to authenticated;

commit;
