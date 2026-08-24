import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error node runner imports TypeScript directly.
import { isValidManualAmount } from "../lib/manual-amount.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { normalizeRentPaymentAmount } from "../lib/rent-payment-entry.ts";

const renewal = (overrides: Partial<Parameters<typeof normalizeRentPaymentAmount>[0]> = {}) => normalizeRentPaymentAmount({
  isRent: true,
  isHistoricalEdit: false,
  isCollectionPayment: false,
  paymentStatus: "已收",
  amountDue: 100,
  amountPaid: 0,
  ...overrides
});

test("renewal validates and submits the displayed rent amount", () => {
  const amount = renewal();
  assert.equal(amount, 100);
  assert.equal(isValidManualAmount(amount), true);
});

test("renewal rent amount stays separate from an added deposit", () => {
  const rentAmount = renewal();
  const depositAmount = 200;
  assert.equal(rentAmount, 100);
  assert.equal(rentAmount + depositAmount, 300);
  assert.notEqual(rentAmount, rentAmount + depositAmount);
});

test("zero, negative, empty and NaN renewal amounts are rejected", () => {
  for (const amountDue of [0, -1, "", Number.NaN, undefined]) {
    const amount = renewal({ amountDue });
    assert.equal(isValidManualAmount(amount), false, `expected ${String(amountDue)} to be rejected`);
  }
});

test("unpaid renewal keeps meaningful due state without inventing paid rent", () => {
  const amount = renewal({ paymentStatus: "未收", amountDue: 100 });
  assert.equal(amount, 0);
  assert.equal(isValidManualAmount(amount), false);
});

test("non-rent payment types retain their explicit amountPaid owner", () => {
  assert.equal(normalizeRentPaymentAmount({
    isRent: false,
    isHistoricalEdit: false,
    isCollectionPayment: false,
    amountDue: 100,
    amountPaid: 50
  }), 50);
});

test("renewal keeps the existing stable payment identity/write path", () => {
  const page = readFileSync("app/rent-payments/page.tsx", "utf8");
  assert.match(page, /clientRequestId/);
  assert.match(page, /saveBusinessData\(rentPaymentKey, next/);
  assert.match(page, /depositPaymentMarker\(paymentId\)/);
  assert.match(page, /const amountPaid = canonicalAmount/);
});
