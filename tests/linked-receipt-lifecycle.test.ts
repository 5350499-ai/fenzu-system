import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260824124815_linked_receipt_delete_audit_snapshot.sql", "utf8");
const route = readFileSync("app/api/rent-payments/lifecycle/route.ts", "utf8");
const page = readFileSync("app/rent-payments/page.tsx", "utf8");

function functionBody(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, name);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, name);
  return migration.slice(start, end);
}

test("linked receipt lifecycle uses two explicit atomic RPC roots", () => {
  for (const name of ["void_rent_payment_with_linked_deposit", "permanently_delete_rent_payment_with_linked_deposit"]) {
    const rpc = functionBody(name);
    assert.match(rpc, /security definer/);
    assert.match(rpc, /set search_path = ''/);
    assert.match(rpc, /auth\.uid\(\) is null or not app_private\.is_app_session_valid\(\)/);
    assert.match(rpc, /user_id = v_actor\.workspace_owner_id/);
    assert.match(rpc, /app_private\.can_access_property\(v_payment\.property_id\)/);
    assert.match(rpc, /for update/);
  }
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.doesNotMatch(migration, /pg_get_functiondef|regexp_replace\s*\(\s*pg_get_functiondef/i);
});

test("marker resolution is exact, cardinality checked, and entity scoped", () => {
  for (const name of ["void_rent_payment_with_linked_deposit", "permanently_delete_rent_payment_with_linked_deposit"]) {
    const rpc = functionBody(name);
    assert.match(rpc, /v_marker := '\[收租押金:' \|\| v_payment\.id::text \|\| '\]'/);
    assert.match(rpc, /if v_candidate_count > 1 then[\s\S]*errcode = '21000'/);
    assert.match(rpc, /regexp_matches\(coalesce\(v_deposit\.notes, ''\), '\\\[收租押金:\[\^\]\]\+\\\]'/);
    assert.match(rpc, /if v_marker_count <> 1/);
    assert.match(rpc, /v_deposit\.user_id <> v_payment\.user_id/);
    assert.match(rpc, /v_deposit\.tenant_id is distinct from v_payment\.tenant_id/);
    assert.match(rpc, /v_deposit\.property_id <> v_payment\.property_id/);
    assert.match(rpc, /v_deposit\.room_id is distinct from v_payment\.room_id/);
    assert.match(rpc, /v_deposit\.transaction_type not in \('收取', 'collected'\)/);
    assert.match(rpc, /lock table public\.deposits in share row exclusive mode/);
  }
});

test("void changes both new separated sources but preserves legacy mixed deposits", () => {
  const rpc = functionBody("void_rent_payment_with_linked_deposit");
  assert.match(rpc, /v_deposit_amount := coalesce\(v_deposit\.amount, 0\);[\s\S]*v_legacy_mixed := v_deposit_amount > 0[\s\S]*amount_paid[\s\S]*amount_due/);
  assert.match(rpc, /if not v_legacy_mixed then[\s\S]*has_module_permission\('deposits', 'archive'\)/);
  assert.match(rpc, /update public\.deposits[\s\S]*set status = '已作废'/);
  assert.match(rpc, /update public\.rent_payments[\s\S]*'\[已作废\]'/);
  assert.match(rpc, /linked deposit already refunded/);
  assert.doesNotMatch(rpc, /status = '已退'/);
  assert.match(page, /filteredPayments\.reduce\(\(total, payment\) => total \+ \(isVoided\(payment\.notes\) \? 0 : paymentListAmount/);
});

test("permanent delete removes an exact unique linked deposit regardless of finance classification", () => {
  const rpc = functionBody("permanently_delete_rent_payment_with_linked_deposit");
  assert.match(rpc, /v_classification := case when v_legacy_mixed then 'LEGACY_MIXED_RENEWAL' else 'NEW_SEPARATED_RENEWAL' end/);
  assert.match(rpc, /if v_candidate_count = 1 then[\s\S]*has_module_permission\('deposits', 'delete'\)/);
  assert.match(rpc, /delete from public\.deposits where id = v_deposit\.id;[\s\S]*delete from public\.rent_payments where id = v_payment\.id;/);
  assert.doesNotMatch(rpc, /if not v_legacy_mixed then[\s\S]*delete from public\.deposits/);
  assert.doesNotMatch(rpc, /exception\s+when\s+others/i);
});

test("aggregate lifecycle audit is transaction-local and captures immutable amount components", () => {
  for (const name of ["void_rent_payment_with_linked_deposit", "permanently_delete_rent_payment_with_linked_deposit"]) {
    const rpc = functionBody(name);
    assert.match(rpc, /insert into public\.audit_logs/);
    for (const field of ["paymentId", "depositId", "propertyId", "roomId", "tenantId", "workspaceOwnerId", "actorUserId", "rentAmount", "depositAmount", "totalAmount", "classification", "paymentStatusBefore", "depositStatusBefore"]) {
      assert.match(rpc, new RegExp(`'${field}'`), `${name}:${field}`);
    }
    assert.match(rpc, /v_total_amount, '(?:作废|永久删除)关联收款', true/);
    assert.doesNotMatch(rpc, /exception\s+when\s+others/i);
  }
  const voidRpc = functionBody("void_rent_payment_with_linked_deposit");
  const deleteRpc = functionBody("permanently_delete_rent_payment_with_linked_deposit");
  assert.ok(voidRpc.indexOf("update public.rent_payments") < voidRpc.indexOf("insert into public.audit_logs"));
  assert.ok(deleteRpc.indexOf("delete from public.deposits") < deleteRpc.indexOf("insert into public.audit_logs"));
  assert.ok(deleteRpc.indexOf("delete from public.rent_payments") < deleteRpc.indexOf("insert into public.audit_logs"));
});

test("RPC grants stay authenticated-only and keep service-role/public closed", () => {
  assert.match(migration, /revoke all on function public\.void_rent_payment_with_linked_deposit\(uuid\) from public, anon, authenticated, service_role;/);
  assert.match(migration, /revoke all on function public\.permanently_delete_rent_payment_with_linked_deposit\(uuid\) from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant execute on function public\.void_rent_payment_with_linked_deposit\(uuid\) to authenticated;/);
  assert.match(migration, /grant execute on function public\.permanently_delete_rent_payment_with_linked_deposit\(uuid\) to authenticated;/);
  assert.doesNotMatch(migration, /grant execute[^;]+to (?:public|anon|service_role)/i);
});

test("client uses one lifecycle request and never performs a payment/deposit double POST", () => {
  assert.match(route, /requireActiveAccount/);
  assert.match(route, /requireModulePermission\(context, "rent_payments", permission\)/);
  assert.match(route, /requirePropertyAccess\(context, payment\.property_id\)/);
  assert.match(route, /verifier\.rpc\(rpcName, \{ p_payment_id: body\.paymentId \}\)/);
  assert.match(page, /applyRentPaymentLifecycle\(payment\.id, action\)/);
  const lifecycleBody = page.slice(page.indexOf("function voidPayment"), page.indexOf("async function addPaymentFile"));
  assert.doesNotMatch(lifecycleBody, /saveBusinessData|persist\(/);
});

test("void and delete buttons open an app-owned confirmation before invoking the lifecycle request", () => {
  assert.match(page, /function voidPayment\(payment: BusinessRentPayment\)[\s\S]*setLifecycleConfirmation\(\{ action: "void", payment \}\)/);
  assert.match(page, /function permanentlyDelete\(payment: BusinessRentPayment\)[\s\S]*setLifecycleConfirmation\(\{ action: "delete", payment \}\)/);
  assert.match(page, /<ConfirmDialog[\s\S]*open=\{Boolean\(lifecycleConfirmation\)\}[\s\S]*onConfirm=\{\(\) => void confirmPaymentLifecycle\(\)\}/);
  const lifecycleBody = page.slice(page.indexOf("function voidPayment"), page.indexOf("async function addPaymentFile"));
  assert.doesNotMatch(lifecycleBody, /window\.confirm\(/);
});

test("lifecycle confirmation uses one canonical action for RPC and local state", () => {
  const body = page.slice(page.indexOf("async function confirmPaymentLifecycle"), page.indexOf("async function addPaymentFile"));
  assert.match(body, /const \{ action, payment \} = lifecycleConfirmation/);
  assert.match(body, /applyRentPaymentLifecycle\(payment\.id, action\)/);
  assert.match(body, /if \(action === "void"\)/);
  assert.match(body, /invalidateBusinessData\(\[rentPaymentKey, depositKey\]\)/);
  assert.doesNotMatch(body, /saveBusinessData|persist\(/);
});

test("database delete is authoritative and external attachment cleanup is best effort afterward", () => {
  assert.ok(route.indexOf("verifier.rpc(rpcName") < route.indexOf("for (const file of paymentFiles)"));
  assert.match(route, /attachmentCleanupWarning/);
  assert.match(route, /rent_payment_files/);
  assert.doesNotMatch(route, /restoreGoogleDriveFile/);
});

test("ambiguity, unauthorized access, invalid identity and FK conflicts fail closed", () => {
  for (const code of ["42501", "P0002", "21000", "22023", "23503"]) assert.ok(route.includes(`error.code === "${code}"`), code);
  assert.match(route, /数据库事务已回滚/);
  assert.match(route, /检测到多条押金关联，本次操作已停止，数据未修改/);
});
