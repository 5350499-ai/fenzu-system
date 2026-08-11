import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { PAYMENT_METHOD_PRESETS, paymentMethodOptions } from "../lib/payment-method-presets.ts";

test("new payment entries use the compact shared presets", () => {
  assert.deepEqual(PAYMENT_METHOD_PRESETS, ["现金", "转账", "其他"]);
  assert.equal(PAYMENT_METHOD_PRESETS.includes("Bizum" as never), false);
});

test("a historical payment method remains visible without altering presets", () => {
  assert.deepEqual(paymentMethodOptions("Bizum").map((option) => option.value), ["现金", "转账", "其他", "Bizum"]);
  assert.deepEqual(paymentMethodOptions("转账").map((option) => option.value), ["现金", "转账", "其他"]);
});
