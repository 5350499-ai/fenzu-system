-- Local-only final schema bootstrap for Restore acceptance.
-- This is not a Production migration and must never be applied to a linked
-- project. It makes the empty local database match the captured live schema
-- after the historical repository migration chain has completed.

alter table if exists public.properties drop column if exists landlord_id;
alter table if exists public.rooms drop column if exists area;
alter table if exists public.rooms drop column if exists has_window;
alter table if exists public.rooms drop column if exists has_private_bathroom;
alter table if exists public.rooms drop column if exists furniture;
alter table if exists public.tenants drop column if exists whatsapp;
alter table if exists public.tenants drop column if exists passport_number;
alter table if exists public.tenants drop column if exists nie_number;
alter table if exists public.tenants drop column if exists nationality;
alter table if exists public.tenants drop column if exists move_in_date;
alter table if exists public.tenants drop column if exists expected_move_out_date;
alter table if exists public.tenants drop column if exists key_count;
alter table if exists public.contracts drop column if exists contract_type;
alter table if exists public.contracts drop column if exists landlord_id;
alter table if exists public.contracts drop column if exists is_signed;
alter table if exists public.contracts drop column if exists is_active;
alter table if exists public.contracts drop column if exists file_url;
alter table if exists public.contracts drop column if exists storage_path;
alter table if exists public.tasks drop column if exists completed_at;

do $verify$
declare
  stale text[] := array[
    'properties.landlord_id', 'rooms.area', 'rooms.has_window',
    'rooms.has_private_bathroom', 'rooms.furniture', 'tenants.whatsapp',
    'tenants.passport_number', 'tenants.nie_number', 'tenants.nationality',
    'tenants.move_in_date', 'tenants.expected_move_out_date', 'tenants.key_count',
    'contracts.contract_type', 'contracts.landlord_id', 'contracts.is_signed',
    'contracts.is_active', 'contracts.file_url', 'contracts.storage_path',
    'tasks.completed_at'
  ];
  item text;
  v_table_name text;
  v_column_name text;
begin
  foreach item in array stale loop
    v_table_name := split_part(item, '.', 1);
    v_column_name := split_part(item, '.', 2);
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = v_table_name and c.column_name = v_column_name
    ) then
      raise exception 'local Production-equivalent bootstrap left stale column %', item;
    end if;
  end loop;
end;
$verify$;

-- The local PostgREST service-role key must exercise the same Restore boundary
-- as the server-owned RPC. These grants are local bootstrap parity, not a
-- Production privilege change.
grant select, insert, update, delete on public.properties, public.rooms,
  public.tenants, public.contracts, public.rent_payments, public.expenses,
  public.deposits, public.viewing_appointments, public.tasks, public.partners,
  public.partner_property_shares, public.partner_name_history,
  public.partner_settlement_batches, public.partner_settlement_partner_snapshots,
  public.partner_settlement_segment_snapshots, public.partner_settlement_transfer_snapshots,
  public.check_in_requests, public.tenant_create_requests to service_role;
grant select, insert on public.audit_logs to service_role;
