import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260825130000_restore_trusted_context_permission.sql", "utf8");
const updateMigration = readFileSync("supabase/migrations/20260821130000_move_out_permission_context.sql", "utf8");
const triggerOwnerMigration = readFileSync("supabase/migrations/202607150001_account_permissions_stage3.sql", "utf8");
const restorePermissionMigration = readFileSync("supabase/migrations/20260825080000_restore_free_single_owner_permission.sql", "utf8");

test("trusted Restore context is transaction-local, actor/workspace-bound and service-owned", () => {
  assert.match(migration, /create or replace function app_private\.is_trusted_restore_context/);
  assert.match(migration, /app\.restore_mode/);
  assert.match(migration, /app\.restore_context_scope/);
  assert.match(migration, /app\.restore_actor_id/);
  assert.match(migration, /app\.restore_workspace_id/);
  assert.match(migration, /request\.jwt\.claim\.role/);
  assert.match(migration, /account_plan = 'free_single'/);
  assert.match(migration, /profile\.auth_user_id = profile\.workspace_owner_id/);
  assert.match(migration, /set_config\(''app\.restore_context_scope'', ''transaction'', true\)/);
  assert.match(migration, /set_config\(''app\.restore_actor_id'', p_actor_account_id::text, true\)/);
  assert.match(migration, /set_config\(''app\.restore_workspace_id'', p_workspace_owner_id::text, true\)/);
  assert.match(migration, /set_config\(''request\.jwt\.claim\.role'', ''service_role'', true\)/);
  assert.match(migration, /revoke all on function app_private\.is_trusted_restore_context\(\) from public, anon, authenticated, service_role/);
});

test("shared update enforcement preserves ordinary CRUD and move-out branches", () => {
  assert.match(migration, /if app_private\.is_trusted_restore_context\(\)/);
  assert.match(migration, /app_private\.is_owner\(\)/);
  assert.match(migration, /app_private\.is_canonical_move_out_context\(\)/);
  assert.match(migration, /has_module_permission\(module_key, 'edit'\)/);
  assert.match(migration, /has_module_permission\(module_key, 'archive'\)/);
  assert.doesNotMatch(migration, /disable trigger|drop trigger/i);
});

test("Restore boundary and permission contract remain unchanged", () => {
  assert.match(restorePermissionMigration, /account_type = 'owner'/);
  assert.match(restorePermissionMigration, /account_plan = 'free_single'/);
  assert.match(restorePermissionMigration, /source workspace does not match target workspace/);
  assert.match(restorePermissionMigration, /grant execute on function public\.restore_workspace_backup\(uuid, uuid, jsonb\) to service_role/);
  assert.match(updateMigration, /set_config\('app\.canonical_move_out', 'true', true\)/);
  for (const table of ["properties", "rooms", "tenants", "contracts", "rent_payments", "expenses", "deposits", "tasks"]) {
    assert.match(triggerOwnerMigration, new RegExp(`array\\['${table}'`), table);
  }
  assert.doesNotMatch(migration, /create trigger|drop trigger|disable trigger/i);
});
