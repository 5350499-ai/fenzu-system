import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildAuditLogSummary } from "../lib/audit-log-summary.ts";

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

test("historical snake case and camel case audit amounts remain displayable", () => {
  assert.equal(buildAuditLogSummary({ before_data: { amount_paid: 30 } }, "EUR", euro), "€30.00");
  assert.equal(buildAuditLogSummary({ after_data: { amountPaid: 40 } }, "EUR", euro), "€40.00");
  assert.equal(buildAuditLogSummary({ amount: 50, before_data: null }, "EUR", euro), "€50.00");
});

test("audit API projects amount and the page owns explicit lifecycle labels and shared summary", () => {
  assert.match(api, /before_data,after_data,amount,description/);
  assert.match(page, /value === "linked_receipt_void"\) return "作废"/);
  assert.match(page, /value === "linked_receipt_delete"\) return "永久删除"/);
  assert.match(page, /return buildAuditLogSummary\(log, currencyCode, formatCurrency\)/);
});
