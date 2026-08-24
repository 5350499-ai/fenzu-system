import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260824135118_checkin_receipt_delete_replay_safety.sql", "utf8");
const checkInMigration = readFileSync("supabase/migrations/20260824112251_checkin_rent_deposit_finance_model.sql", "utf8");
const checkInPage = readFileSync("app/check-in/page.tsx", "utf8");

function deleteRpc() {
  const start = migration.indexOf("create or replace function public.permanently_delete_rent_payment_with_linked_deposit");
  assert.notEqual(start, -1);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1);
  return migration.slice(start, end);
}

test("check-in receipt deletion only clears an exact complete internal reference graph", () => {
  const rpc = deleteRpc();
  assert.match(rpc, /select count\(\*\) into v_check_in_count[\s\S]*rent_payment_id = v_payment\.id[\s\S]*deposit_id = v_deposit\.id/);
  assert.match(rpc, /if v_check_in_count > 1 then[\s\S]*errcode = '21000'[\s\S]*ambiguous check-in receipt relationship/);
  assert.match(rpc, /for update;[\s\S]*v_check_in_request\.rent_payment_id is distinct from v_payment\.id[\s\S]*v_check_in_request\.deposit_id is distinct from v_deposit\.id/);
  assert.match(rpc, /workspace_owner_id <> v_payment\.user_id/);
  assert.match(rpc, /v_contract\.tenant_id is distinct from v_payment\.tenant_id[\s\S]*v_contract\.property_id <> v_payment\.property_id[\s\S]*v_contract\.room_id is distinct from v_payment\.room_id/);
  assert.match(rpc, /update public\.check_in_requests[\s\S]*rent_payment_id = null,[\s\S]*deposit_id = null/);
  assert.doesNotMatch(migration, /on delete\s+(?:cascade|set null)/i);
});

test("check-in replay result carries no dead receipt ids after canonical permanent delete", () => {
  const rpc = deleteRpc();
  assert.match(rpc, /v_check_in_request\.result - 'rentPaymentId' - 'depositId'/);
  assert.match(rpc, /'rentPaymentId', null,[\s\S]*'depositId', null,[\s\S]*'receiptDeleted', true,[\s\S]*'receiptLifecycle', 'permanently_deleted'/);
  assert.match(checkInMigration, /return v_request\.result \|\| jsonb_build_object\('idempotentReplay', true\)/);
  assert.match(checkInPage, /receiptDeleted\?: boolean/);
  assert.match(checkInPage, /const receiptDeleted = result\.receiptDeleted === true/);
  assert.match(checkInPage, /入住已完成，但本次收款记录已被永久删除。/);
  assert.doesNotMatch(rpc, /insert into public\.rent_payments[\s\S]*check_in_requests/);
  assert.doesNotMatch(rpc, /insert into public\.deposits[\s\S]*check_in_requests/);
});

test("check-in-aware delete remains transaction-local and preserves immutable aggregate audit evidence", () => {
  const rpc = deleteRpc();
  assert.ok(rpc.indexOf("update public.check_in_requests") < rpc.indexOf("delete from public.deposits"));
  assert.ok(rpc.indexOf("delete from public.deposits") < rpc.indexOf("delete from public.rent_payments"));
  assert.ok(rpc.indexOf("delete from public.rent_payments") < rpc.indexOf("insert into public.audit_logs"));
  for (const field of ["paymentId", "depositId", "checkInRequestId", "contractId", "receiptOrigin", "rentAmount", "depositAmount", "totalAmount"]) {
    assert.match(rpc, new RegExp(`'${field}'`), field);
  }
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.doesNotMatch(rpc, /exception\s+when\s+others/i);
});

test("normal receipt deletion and fail-closed identity guards remain intact", () => {
  const rpc = deleteRpc();
  assert.match(rpc, /v_check_in_count integer := 0/);
  assert.match(rpc, /if v_candidate_count = 1 then[\s\S]*if v_check_in_count = 1 then/);
  assert.match(rpc, /if v_candidate_count > 1 then[\s\S]*ambiguous linked deposit marker/);
  assert.match(rpc, /v_deposit\.user_id <> v_payment\.user_id/);
  assert.match(rpc, /v_deposit\.tenant_id is distinct from v_payment\.tenant_id/);
  assert.match(rpc, /v_deposit\.property_id <> v_payment\.property_id/);
  assert.match(rpc, /v_deposit\.room_id is distinct from v_payment\.room_id/);
  assert.match(rpc, /delete from public\.deposits where id = v_deposit\.id;[\s\S]*delete from public\.rent_payments where id = v_payment\.id;/);
  assert.match(migration, /revoke all on function public\.permanently_delete_rent_payment_with_linked_deposit\(uuid\) from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant execute on function public\.permanently_delete_rent_payment_with_linked_deposit\(uuid\) to authenticated;/);
});
