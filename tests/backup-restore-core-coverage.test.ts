import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260824180000_backup_restore_core_request_scope.sql", "utf8");
const route = fs.readFileSync("app/api/data-restore/route.ts", "utf8");
const backupService = fs.readFileSync("lib/server/backup-service.ts", "utf8");
const exportSource = fs.readFileSync("lib/data-export.ts", "utf8");

test("core backup boundary includes both server-owned request tables", () => {
  assert.match(backupService, /check_in_requests/);
  assert.match(backupService, /tenant_create_requests/);
  assert.match(exportSource, /checkInRequests/);
  assert.match(exportSource, /tenantCreateRequests/);
  assert.match(exportSource, /sourceWorkspaceId/);
});

test("restore enforces strict source workspace binding and request reference integrity", () => {
  assert.match(route, /restore_workspace_mismatch/);
  assert.match(migration, /source workspace does not match target workspace/);
  assert.match(migration, /check-in request reference graph is incomplete/);
  assert.match(migration, /tenant-create request reference graph is incomplete/);
  assert.match(migration, /duplicate check-in client_request_id/);
  assert.match(migration, /duplicate tenant-create client_request_id/);
});

test("restore security boundary remains service-role-only and search_path-scoped", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /revoke all on function public\.restore_workspace_backup\(uuid, uuid, jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.restore_workspace_backup\(uuid, uuid, jsonb\) to service_role/);
  assert.match(migration, /account_type = 'owner'/);
  assert.match(migration, /status = 'active'/);
});

test("request rows restore after the parent transaction and remain atomic", () => {
  const coreRestore = migration.indexOf("perform public.restore_workspace_backup_impl");
  const checkInInsert = migration.indexOf("insert into public.check_in_requests");
  const tenantCreateInsert = migration.indexOf("insert into public.tenant_create_requests");
  assert.ok(coreRestore >= 0);
  assert.ok(checkInInsert > coreRestore);
  assert.ok(tenantCreateInsert > coreRestore);
  assert.match(migration, /delete from public\.check_in_requests/);
  assert.match(migration, /delete from public\.tenant_create_requests/);
  assert.match(migration, /jsonb_populate_recordset\(null::public\.check_in_requests/);
  assert.match(migration, /jsonb_populate_recordset\(null::public\.tenant_create_requests/);
});

test("restore keeps the request result and receipt-deleted replay state in the live row mapping", () => {
  assert.match(migration, /to_jsonb\(r\) - 'created_at' - 'completed_at'/);
  assert.match(route, /sourceWorkspaceId: payload\.metadata\.sourceWorkspaceId/);
  assert.match(route, /checkInRequests: normalizeCollection/);
  assert.match(route, /tenantCreateRequests: normalizeCollection/);
});
