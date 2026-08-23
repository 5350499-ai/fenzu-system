import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { isValidManualAmount } from "../lib/manual-amount.ts";

test("manual amount boundary accepts only finite positive amounts", () => {
  for (const value of [0, 0.0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "1"]) {
    assert.equal(isValidManualAmount(value), false, `expected rejection for ${String(value)}`);
  }
  assert.equal(isValidManualAmount(0.01), true);
  assert.equal(isValidManualAmount(88.88), true);
});

test("manual amount enforcement is opt-in and preserves non-manual zero records", async () => {
  const { readFileSync } = await import("node:fs");
  const api = readFileSync("app/api/business-data/route.ts", "utf8");
  const payments = readFileSync("app/rent-payments/page.tsx", "utf8");
  const expenses = readFileSync("app/expenses/page.tsx", "utf8");
  assert.match(api, /manualEntry\?: boolean/);
  assert.match(api, /validateManualAmount\(resource, row, body\.manualEntry === true\)/);
  assert.match(api, /resource\.table === "expenses"/);
  assert.match(api, /row\.payment_status !== "未收"/);
  assert.match(payments, /manualEntry: true/);
  assert.match(expenses, /manualEntry: true/);
  assert.match(payments, /form\.paymentStatus !== "未收"/);
});
