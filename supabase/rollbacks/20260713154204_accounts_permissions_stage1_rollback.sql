-- Non-destructive functional rollback for Phase 1.
-- It restores the original business-table RLS behavior without dropping any
-- table, function, historical row, or owner profile.

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'properties',
    'rooms',
    'tenants',
    'contracts',
    'rent_payments',
    'expenses',
    'deposits',
    'tasks',
    'tenant_notes',
    'contract_files',
    'rent_payment_files',
    'expense_files'
  ]
  loop
    execute format(
      'drop policy if exists stage1_owner_compatibility on public.%I',
      table_name
    );
  end loop;
end $$;

commit;

-- The six additive permission tables and app_private helper functions remain
-- in place but are not used by the original business policies after rollback.
-- This deliberately avoids DROP TABLE and preserves every existing row.
