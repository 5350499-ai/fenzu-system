import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildAuditLogSummary, getLinkedReceiptAuditPresentation, sortAuditLogsForPresentation } from "../lib/audit-log-summary.ts";

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

test("historical snake case and camel case audit amounts remain displayable", () => {
  assert.equal(buildAuditLogSummary({ before_data: { amount_paid: 30 } }, "EUR", euro), "€30.00");
  assert.equal(buildAuditLogSummary({ after_data: { amountPaid: 40 } }, "EUR", euro), "€40.00");
  assert.equal(buildAuditLogSummary({ amount: 50, before_data: null }, "EUR", euro), "€50.00");
});

test("audit API projects amount and the page owns explicit lifecycle labels and shared summary", () => {
  assert.match(api, /before_data,after_data,amount,description/);
  assert.match(api, /sortAuditLogsForPresentation/);
  assert.match(page, /value === "linked_receipt_void"\) return "作废"/);
  assert.match(page, /value === "linked_receipt_delete"\) return "永久删除"/);
  assert.match(page, /getLinkedReceiptAuditPresentation/);
  assert.match(page, /linkedReceipt\.title/);
  assert.match(page, /linkedReceipt\.totalAmount/);
  assert.match(page, /return buildAuditLogSummary\(log, currencyCode, formatCurrency\)/);
});
