import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { getRentPeriodState } from "../lib/rent-period-state.ts";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { shouldShowTenantRentReminder } from "../lib/rent-coverage.ts";

const TODAY = "2026-08-11";
const tenant = (status = "\u5728\u79df") => ({ id: "tenant-policy", status } as BusinessTenant);
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-policy",
  tenantId: "tenant-policy",
  incomeType: "\u623f\u79df\u6536\u5165",
  paymentStatus: "\u672a\u6536",
  amountDue: 100,
  amountPaid: 0,
  amountUnpaid: 100,
  coverageStartDate: "2026-07-01",
  coverageEndDate: "2026-07-31",
  notes: "",
  ...overrides
} as BusinessRentPayment);

test("1.5 policy matrix keeps debt facts independent from archive and move-out", () => {
  const open = payment();
  const inRent = getRentPeriodState({ tenant: tenant(), payment: open, today: TODAY });
  const movedOut = getRentPeriodState({ tenant: tenant("\u5df2\u9000\u79df"), payment: open, today: TODAY });
  const archived = getRentPeriodState({ tenant: tenant("\u5df2\u5f52\u6863"), payment: open, today: TODAY });
  const movedOutArchived = getRentPeriodState({ tenant: tenant("\u5df2\u5f52\u6863"), payment: open, today: TODAY });

  for (const state of [inRent, movedOut, archived, movedOutArchived]) {
    assert.equal(state.hasHistoricalDebtEvent, true);
    assert.equal(state.hasCurrentUnresolvedDebt, true);
    assert.equal(state.remainingAmount, 100);
    assert.equal(state.hasOpenDebtFollowUp, true);
  }
});

test("1.5 reminder policy matrix mutes archive only and restores the same candidate", () => {
  const open = payment();
  const movedOut = tenant("\u5df2\u9000\u79df");
  const archived = tenant("\u5df2\u5f52\u6863");

  assert.equal(shouldShowTenantRentReminder(tenant(), open, new Set(), TODAY), true);
  assert.equal(shouldShowTenantRentReminder(movedOut, open, new Set(), TODAY), true);
  assert.equal(shouldShowTenantRentReminder(archived, open, new Set(), TODAY), false);
  // Returning from archive must use the same period facts and re-enable the candidate.
  assert.equal(shouldShowTenantRentReminder(tenant(), open, new Set(), TODAY), true);
});

test("1.5 waiver and collection matrix is payment-specific and non-financial", () => {
  const first = payment();
  const second = payment({ id: "payment-policy-b" });
  const waived = getRentPeriodState({ tenant: tenant(), payment: first, today: TODAY, waivedPaymentIds: new Set([first.id]) });
  const untouched = getRentPeriodState({ tenant: tenant(), payment: second, today: TODAY, waivedPaymentIds: new Set([first.id]) });

  assert.equal(waived.hasHistoricalDebtEvent, true);
  assert.equal(waived.remainingAmount, 100);
  assert.equal(waived.collectionRequired, false);
  assert.equal(waived.hasOpenDebtFollowUp, false);
  assert.equal(untouched.hasOpenDebtFollowUp, true);
  assert.equal(shouldShowTenantRentReminder(tenant(), first, new Set([first.id]), TODAY), false);
});

test("1.5 zero-amount overdue event remains waivable without an invented balance", () => {
  const zero = payment({ id: "payment-zero", amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const open = getRentPeriodState({ tenant: tenant(), payment: zero, today: TODAY });
  const waived = getRentPeriodState({ tenant: tenant(), payment: zero, today: TODAY, waivedPaymentIds: new Set([zero.id]) });

  assert.equal(open.isZeroAmountOverdueEvent, true);
  assert.equal(open.canCollect, false);
  assert.equal(open.canWaive, true);
  assert.equal(open.hasOpenDebtFollowUp, true);
  assert.equal(waived.hasOpenDebtFollowUp, false);
  assert.equal(zero.amountDue, 0);
  assert.equal(zero.amountPaid, 0);
  assert.equal(zero.amountUnpaid, 0);
});
