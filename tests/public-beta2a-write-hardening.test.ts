import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260815100000_beta2a_write_hardening.sql", "utf8");
const businessData = readFileSync("lib/business-data.ts", "utf8");
const businessRoute = readFileSync("app/api/business-data/route.ts", "utf8");
const paymentPage = readFileSync("app/rent-payments/page.tsx", "utf8");
const moveOutRoute = readFileSync("app/api/tenants/move-out/route.ts", "utf8");
const tenantPage = readFileSync("app/tenants/page.tsx", "utf8");

test("rent payment persistence has a workspace-scoped additive identity", () => {
  assert.match(migration, /add column if not exists client_request_id uuid/);
  assert.match(migration, /on public\.rent_payments \(user_id, client_request_id\)/);
  assert.match(migration, /where client_request_id is not null/);
  assert.match(businessData, /clientRequestId\?: string/);
  assert.match(businessData, /client_request_id/);
  assert.match(businessRoute, /rent_payment_identity|rentPaymentIdentityFingerprint/i);
});

test("rent payment retries replay and payload reuse conflicts", () => {
  assert.match(businessRoute, /error\.code === "23505"/);
  assert.match(businessRoute, /eq\("client_request_id", row\.client_request_id\)/);
  assert.match(businessRoute, /rent_payment_request_conflict/);
  assert.match(businessRoute, /savedRows\.push\(\{ id: String\(existingPayment\.id\) \}\)/);
  assert.match(paymentPage, /newPaymentIdRef/);
  assert.match(paymentPage, /const clientRequestId/);
});

test("move out has one authenticated atomic RPC boundary", () => {
  assert.match(migration, /create or replace function public\.move_out_tenant_atomic/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /user_id = v_actor\.workspace_owner_id/);
  assert.match(migration, /for update/);
  assert.match(migration, /set status = U&'\\5df2\\7ed3\\675f',[\s\S]*is_active = false/);
  assert.match(migration, /alreadyMovedOut/);
  assert.match(moveOutRoute, /requireActiveAccount/);
  assert.match(moveOutRoute, /move_out_tenant_atomic/);
  assert.match(tenantPage, /api\/tenants\/move-out/);
  assert.doesNotMatch(tenantPage, /persistAll\(plan/);
});

test("move out RPC preserves rollback semantics and excludes unrelated side effects", () => {
  const rpc = migration.slice(migration.indexOf("create or replace function public.move_out_tenant_atomic"));
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(rpc, /update public\.tenants/);
  assert.match(rpc, /update public\.contracts/);
  assert.match(rpc, /update public\.deposits/);
  assert.match(rpc, /update public\.rooms/);
  assert.doesNotMatch(rpc, /notification|cache|toast|browser/i);
});
