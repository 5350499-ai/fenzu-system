import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner needs the explicit extension.
import { DEFAULT_CURRENCY, formatCurrency, normalizeCurrencyCode, SUPPORTED_CURRENCIES } from "../lib/currency.ts";

test("workspace currency defaults to EUR and only accepts supported ISO codes", () => {
  assert.equal(DEFAULT_CURRENCY, "EUR");
  assert.deepEqual(SUPPORTED_CURRENCIES, ["EUR", "USD", "GBP", "CNY", "JPY"]);
  assert.equal(normalizeCurrencyCode("usd"), "USD");
  assert.equal(normalizeCurrencyCode("invalid"), "EUR");
});

test("currency formatter changes display only and preserves the numeric input", () => {
  const amount = 100;
  assert.equal(formatCurrency(amount, "EUR"), "€100.00");
  assert.equal(formatCurrency(amount, "USD"), "$100.00");
  assert.equal(formatCurrency(amount, "GBP"), "£100.00");
  assert.equal(formatCurrency(amount, "CNY"), "¥100.00");
  assert.equal(formatCurrency(amount, "JPY"), "¥100");
  assert.equal(amount, 100);
});

test("currency is independent of interface language", () => {
  assert.equal(formatCurrency(123.45, "USD"), "$123.45");
  assert.equal(formatCurrency(123.45, "EUR"), "€123.45");
});
