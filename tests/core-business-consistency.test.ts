import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260821130000_move_out_permission_context.sql", "utf8");
const route = readFileSync("app/api/tenants/move-out/route.ts", "utf8");
const tenantPage = readFileSync("app/tenants/page.tsx", "utf8");
const debtState = readFileSync("lib/rent-period-state.ts", "utf8");
const reminderEngine = readFileSync("lib/reminder-engine.ts", "utf8");

test("move-out uses one canonical atomic root with a transaction-local permission context", () => {
  assert.match(route, /requireMoveOutPermission/);
  assert.match(route, /move_out_tenant_atomic/);
  assert.match(migration, /is_free_single_workspace_owner/);
  assert.match(migration, /is_canonical_move_out_context/);
  assert.match(migration, /set_config\('app\.canonical_move_out', 'true', true\)/);
  assert.match(migration, /begin;/);
  assert.match(migration, /commit;/);
  assert.match(migration, /update public\.tenants/);
  assert.match(migration, /update public\.contracts/);
  assert.match(migration, /update public\.deposits/);
  assert.match(migration, /update public\.rooms/);
});

test("move-out keeps debt and reminder derivation outside the lifecycle transaction", () => {
  assert.doesNotMatch(migration, /rent_payments\s+set|delete\s+from\s+public\.rent_payments/i);
  assert.doesNotMatch(migration, /waiv|settlement/i);
  assert.match(debtState, /Move-out does not settle|moved_out/);
  assert.match(reminderEngine, /move-out|moved_out|archived/);
});

test("move-out maps known database failures without collapsing every error into auth expiry", () => {
  assert.match(route, /move_out_reference_conflict/);
  assert.match(route, /move_out_duplicate_conflict/);
  assert.match(route, /atomic RPC failed/);
  assert.match(route, /move_out_transaction_failed/);
  assert.doesNotMatch(route, /登录已失效.*move-out/);
});

test("client retains duplicate submission protection and canonical debt actions", () => {
  assert.match(tenantPage, /createMoveOutSubmissionGuard/);
  assert.match(tenantPage, /primaryDebtCase\?\.canWaive/);
  assert.match(tenantPage, /debtCase\.canWaive/);
  assert.match(tenantPage, /api\/rent-collection/);
});
