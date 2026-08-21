import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { getLatestRentPeriodState, getRentPeriodState, rentPeriodRemainingAmount } from "../lib/rent-period-state.ts";

const TODAY = "2026-03-01";
const tenant = (status = "\u5728\u79df") => ({ id: "tenant-a", status, propertyId: "property-a", roomId: "room-a" } as BusinessTenant);
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-a",
  tenantId: "tenant-a",
  propertyId: "property-a",
  roomId: "room-a",
  incomeType: "\u623f\u79df\u6536\u5165",
  paymentStatus: "\u672a\u6536",
  amountDue: 100,
  amountPaid: 0,
  amountUnpaid: 100,
  coverageStartDate: "2026-02-01",
  coverageEndDate: "2026-02-28",
  createdAt: "2026-02-01T10:00:00.000Z",
  notes: "",
  ...overrides
} as BusinessRentPayment);

test("rent period state distinguishes fully-paid active, upcoming, due-today, and overdue coverage", () => {
  const active = getRentPeriodState({ tenant: tenant(), payment: payment({ coverageEndDate: "2026-03-10", amountPaid: 100, amountUnpaid: 0, paymentStatus: "\u5df2\u6536" }), today: TODAY });
  assert.equal(active.isCoverageActive, true);
  assert.equal(active.isExpired, false);
  assert.equal(active.reminderStage, "upcoming");
  assert.equal(active.remainingAmount, 0);

  const upcoming = getRentPeriodState({ tenant: tenant(), payment: payment({ coverageEndDate: "2026-03-04", amountPaid: 100, amountUnpaid: 0, paymentStatus: "\u5df2\u6536" }), today: TODAY });
  assert.equal(upcoming.reminderStage, "urgent");
  assert.equal(upcoming.isExpired, false);

  const today = getRentPeriodState({ tenant: tenant(), payment: payment({ coverageEndDate: TODAY }), today: TODAY });
  assert.equal(today.isDueToday, true);
  assert.equal(today.isExpired, false);
  assert.equal(today.reminderStage, "critical");

  const overdue = getRentPeriodState({ tenant: tenant(), payment: payment(), today: TODAY });
  assert.equal(overdue.isExpired, true);
  assert.equal(overdue.overdueDays, 1);
  assert.equal(overdue.reminderStage, "overdue");
  assert.equal(overdue.hasHistoricalDebtEvent, true);
});

test("positive overdue debt keeps facts separate from collection state", () => {
  const state = getRentPeriodState({ tenant: tenant(), payment: payment(), today: TODAY });
  assert.equal(state.amountDue, 100);
  assert.equal(state.amountPaid, 0);
  assert.equal(state.remainingAmount, 100);
  assert.equal(state.hasUnresolvedHistoricalDebt, true);
  assert.equal(state.hasCurrentUnresolvedDebt, true);
  assert.equal(state.collectionRequired, true);
  assert.equal(state.canCollect, true);
  assert.equal(state.canWaive, true);
  assert.equal(state.hasOpenDebtFollowUp, true);
});

test("paid overdue history remains historical but no longer requires collection", () => {
  const paid = payment({ amountPaid: 100, amountUnpaid: 0, paymentStatus: "\u5df2\u6536" });
  const state = getRentPeriodState({ tenant: tenant(), payment: paid, today: TODAY });
  assert.equal(state.hasHistoricalDebtEvent, true);
  assert.equal(state.remainingAmount, 0);
  assert.equal(state.collectionRequired, false);
  assert.equal(state.canCollect, false);
  assert.equal(state.hasOpenDebtFollowUp, false);
});

test("zero-balance overdue events are not collectible or waivable", () => {
  const zero = payment({ amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const state = getRentPeriodState({ tenant: tenant(), payment: zero, today: TODAY });
  const waived = getRentPeriodState({ tenant: tenant(), payment: zero, today: TODAY, waivedPaymentIds: new Set([zero.id]) });
  assert.equal(state.hasHistoricalDebtEvent, true);
  assert.equal(state.remainingAmount, 0);
  assert.equal(state.canCollect, false);
  assert.equal(state.canWaive, false);
  assert.equal(state.isZeroAmountOverdueEvent, true);
  assert.equal(state.hasOpenDebtFollowUp, false);
  assert.equal(waived.waived, true);
  assert.equal(waived.canWaive, false);
  assert.equal(waived.hasOpenDebtFollowUp, false);
  assert.equal(zero.amountDue, 0);
  assert.equal(zero.amountPaid, 0);
  assert.equal(zero.amountUnpaid, 0);
});

test("waiver is payment-specific and closes current follow-up without mutating payment", () => {
  const first = payment();
  const second = payment({ id: "payment-b", coverageStartDate: "2026-01-01", coverageEndDate: "2026-01-31", createdAt: "2026-01-01T10:00:00.000Z" });
  const waived = getRentPeriodState({ tenant: tenant(), payment: first, today: TODAY, waivedPaymentIds: new Set([first.id]) });
  const untouched = getRentPeriodState({ tenant: tenant(), payment: second, today: TODAY, waivedPaymentIds: new Set([first.id]) });
  assert.equal(waived.waived, true);
  assert.equal(waived.waiverPaymentId, first.id);
  assert.equal(waived.hasHistoricalDebtEvent, true);
  assert.equal(waived.remainingAmount, 100);
  assert.equal(waived.collectionRequired, false);
  assert.equal(waived.canWaive, false);
  assert.equal(waived.hasOpenDebtFollowUp, false);
  assert.equal(untouched.waived, false);
  assert.equal(untouched.hasOpenDebtFollowUp, true);
});

test("archived and moved-out lifecycle do not rewrite historical debt", () => {
  const archived = getRentPeriodState({ tenant: tenant("\u5df2\u5f52\u6863"), payment: payment(), today: TODAY });
  const movedOut = getRentPeriodState({ tenant: tenant("\u5df2\u9000\u79df"), payment: payment(), today: TODAY });
  assert.equal(archived.lifecycle, "archived");
  assert.equal(archived.hasUnresolvedHistoricalDebt, true);
  assert.equal(archived.hasCurrentUnresolvedDebt, true);
  assert.equal(archived.hasOpenDebtFollowUp, true);
  assert.equal(movedOut.lifecycle, "ended");
  assert.equal(movedOut.hasUnresolvedHistoricalDebt, true);
  assert.equal(movedOut.hasCurrentUnresolvedDebt, true);
  assert.equal(movedOut.hasOpenDebtFollowUp, true);
});

test("archived waiver closes follow-up while preserving the old debt fact", () => {
  const state = getRentPeriodState({ tenant: tenant("\u5df2\u5f52\u6863"), payment: payment(), today: TODAY, waivedPaymentIds: new Set(["payment-a"]) });
  assert.equal(state.hasHistoricalDebtEvent, true);
  assert.equal(state.hasUnresolvedHistoricalDebt, true);
  assert.equal(state.waived, true);
  assert.equal(state.hasOpenDebtFollowUp, false);
});

test("moved-out waiver closes follow-up without settling the historical debt", () => {
  const state = getRentPeriodState({ tenant: tenant("\u5df2\u9000\u79df"), payment: payment(), today: TODAY, waivedPaymentIds: new Set(["payment-a"]) });
  assert.equal(state.lifecycle, "ended");
  assert.equal(state.hasHistoricalDebtEvent, true);
  assert.equal(state.hasUnresolvedHistoricalDebt, true);
  assert.equal(state.waived, true);
  assert.equal(state.canWaive, false);
  assert.equal(state.hasOpenDebtFollowUp, false);
});

test("restoring an archived tenant changes lifecycle only, not rent debt facts", () => {
  const archived = getRentPeriodState({ tenant: tenant("\u5df2\u5f52\u6863"), payment: payment(), today: TODAY });
  const restored = getRentPeriodState({ tenant: tenant(), payment: payment(), today: TODAY });
  assert.equal(restored.lifecycle, "current");
  assert.equal(restored.amountDue, archived.amountDue);
  assert.equal(restored.amountPaid, archived.amountPaid);
  assert.equal(restored.remainingAmount, archived.remainingAmount);
  assert.equal(restored.hasHistoricalDebtEvent, archived.hasHistoricalDebtEvent);
  assert.equal(restored.waived, archived.waived);
});

test("voided and missing payments never create an actionable period", () => {
  const voided = getRentPeriodState({ tenant: tenant(), payment: payment({ paymentStatus: "\u5df2\u4f5c\u5e9f" }), today: TODAY });
  const missing = getRentPeriodState({ tenant: tenant(), payment: null, today: TODAY });
  assert.equal(voided.hasValidRentPayment, false);
  assert.equal(voided.canWaive, false);
  assert.equal(missing.paymentId, null);
  assert.equal(missing.hasHistoricalDebtEvent, false);
});

test("latest valid period selection is creation-stable and isolates older debt", () => {
  const old = payment({ id: "old", coverageEndDate: "2026-01-31", createdAt: "2026-01-01T10:00:00.000Z" });
  const newer = payment({ id: "new", coverageStartDate: "2026-03-01", coverageEndDate: "2026-03-31", createdAt: "2026-02-20T10:00:00.000Z", amountPaid: 100, amountUnpaid: 0, paymentStatus: "\u5df2\u6536" });
  const state = getLatestRentPeriodState({ tenant: tenant(), payments: [old, newer], today: TODAY });
  assert.equal(state.paymentId, "new");
  assert.equal(state.isExpired, false);
  assert.equal(state.hasHistoricalDebtEvent, false);
});

test("minor-unit normalization avoids floating-point remaining-balance errors", () => {
  const decimal = payment({ amountDue: 0.3, amountPaid: 0.1 + 0.2, amountUnpaid: 0 });
  assert.equal(rentPeriodRemainingAmount(decimal), 0);
  assert.equal(getRentPeriodState({ tenant: tenant(), payment: decimal, today: TODAY }).hasUnresolvedHistoricalDebt, false);
});

test("coverage boundaries support cross-month, cross-year, and leap-day dates", () => {
  const crossMonth = getRentPeriodState({ tenant: tenant(), payment: payment({ coverageStartDate: "2025-12-15", coverageEndDate: "2025-12-31" }), today: "2026-01-01" });
  const leapDay = getRentPeriodState({ tenant: tenant(), payment: payment({ coverageStartDate: "2024-02-01", coverageEndDate: "2024-02-29" }), today: "2024-03-01" });
  assert.equal(crossMonth.overdueDays, 1);
  assert.equal(leapDay.overdueDays, 1);
});
