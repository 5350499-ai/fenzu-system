import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildAuditLogSummary, getAuditBusinessPresentation, getLinkedReceiptAuditPresentation, groupAuditEventsForDisplay, sortAuditLogsForPresentation } from "../lib/audit-log-summary.ts";

const api = readFileSync("app/api/audit-logs/route.ts", "utf8");
const page = readFileSync("app/audit-logs/page.tsx", "utf8");
const euro = (value: number | string | null | undefined) => `€${Number(value || 0).toFixed(2)}`;

test("delete aggregate snapshot renders rent deposit and total from immutable before data", () => {
  assert.equal(buildAuditLogSummary({
    after_data: { result: "success", paymentDeleted: true, depositDeleted: true },
    before_data: { rentAmount: 10, depositAmount: 20, totalAmount: 30 }
  }, "EUR", euro), "房租：€10.00｜押金：€20.00｜合计：€30.00");
});

test("void aggregate snapshot renders the full linked receipt amount", () => {
  assert.equal(buildAuditLogSummary({
    before_data: { rent_amount: "100", deposit_amount: "200", total_amount: "300" }
  }, "EUR", euro), "房租：€100.00｜押金：€200.00｜合计：€300.00");
});

test("lifecycle title uses the immutable total while its detail keeps rent and deposit separate", () => {
  assert.deepEqual(getLinkedReceiptAuditPresentation({
    action_type: "linked_receipt_delete",
    before_data: { rentAmount: 1, depositAmount: 2, totalAmount: 3 }
  }), {
    title: "永久删除收款",
    rentAmount: 1,
    depositAmount: 2,
    totalAmount: 3
  });
  assert.deepEqual(getLinkedReceiptAuditPresentation({
    action_type: "linked_receipt_void",
    before_data: { rent_amount: 100, deposit_amount: 200, total_amount: 300 }
  }), {
    title: "作废收款",
    rentAmount: 100,
    depositAmount: 200,
    totalAmount: 300
  });
});

test("same-transaction aggregate lifecycle event sorts above table trigger detail", () => {
  const logs = sortAuditLogsForPresentation([
    { id: "deposit", created_at: "2026-08-24T14:08:08.795Z", action_type: "delete" },
    { id: "payment", created_at: "2026-08-24T14:08:08.795Z", action_type: "delete" },
    { id: "aggregate", created_at: "2026-08-24T14:08:08.795Z", action_type: "linked_receipt_delete" }
  ]);
  assert.deepEqual(logs.map((log) => log.id), ["aggregate", "deposit", "payment"]);
});

test("check-in aggregate reads the canonical rent/deposit snapshot and total instead of a tenant default", () => {
  assert.deepEqual(getAuditBusinessPresentation({
    action_type: "create_check_in",
    amount: 3,
    after_data: { rentAmount: 1, depositAmount: 2, monthlyRent: 0 }
  }), {
    title: "一键入住",
    rentAmount: 1,
    depositAmount: 2,
    totalAmount: 3
  });
});

test("aggregate groups only exact same-transaction entity graph children", () => {
  const groups = groupAuditEventsForDisplay([
    { id: "tenant", created_at: "2026-08-24T14:07:51.642Z", actor_user_id: "actor", action_type: "insert", entity_id: "tenant-1" },
    { id: "payment", created_at: "2026-08-24T14:07:51.642Z", actor_user_id: "actor", action_type: "insert", entity_id: "payment-1" },
    { id: "deposit", created_at: "2026-08-24T14:07:51.642Z", actor_user_id: "actor", action_type: "insert", entity_id: "deposit-1" },
    { id: "unrelated", created_at: "2026-08-24T14:07:51.642Z", actor_user_id: "actor", action_type: "insert", entity_id: "other-1" },
    { id: "aggregate", created_at: "2026-08-24T14:07:51.642Z", actor_user_id: "actor", action_type: "create_check_in", entity_id: "tenant-1", after_data: { tenantId: "tenant-1", rentPaymentId: "payment-1", depositId: "deposit-1", rentAmount: 1, depositAmount: 2 }, amount: 3 }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].primary.id, "aggregate");
  assert.deepEqual(groups[0].technicalChildren.map((log) => log.id), ["tenant", "payment", "deposit"]);
  assert.equal(groups[1].primary.id, "unrelated");
});

test("historical snake case and camel case audit amounts remain displayable", () => {
  assert.equal(buildAuditLogSummary({ before_data: { amount_paid: 30 } }, "EUR", euro), "€30.00");
  assert.equal(buildAuditLogSummary({ after_data: { amountPaid: 40 } }, "EUR", euro), "€40.00");
  assert.equal(buildAuditLogSummary({ amount: 50, before_data: null }, "EUR", euro), "€50.00");
});

test("audit API projects amount and the page owns explicit lifecycle labels and shared summary", () => {
  assert.match(api, /room_id,tenant_id,before_data,after_data,amount,description/);
  assert.match(api, /sortAuditLogsForPresentation/);
  assert.match(api, /groupAuditEventsForDisplay/);
  assert.match(page, /value === "linked_receipt_void"\) return "作废"/);
  assert.match(page, /value === "linked_receipt_delete"\) return "永久删除"/);
  assert.match(page, /getAuditBusinessPresentation/);
  assert.match(page, /技术明细/);
  assert.match(page, /group\.technicalChildren/);
  assert.match(page, /return buildAuditLogSummary\(log, currencyCode, formatCurrency\)/);
});
