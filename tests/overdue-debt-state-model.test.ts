import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getRentPeriodState } from "../lib/rent-period-state.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getDebtCases } from "../lib/debt-case.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { rentCollectionReminderStage } from "../lib/rent-coverage.ts";

const tenant = (paymentDay = 5) => ({
  id: "tenant-model",
  propertyId: "property-model",
  roomId: "room-model",
  name: "模型测试租客",
  status: "在租",
  monthlyRent: 350,
  paymentDay
} as BusinessTenant);

const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-model",
  tenantId: "tenant-model",
  propertyId: "property-model",
  roomId: "room-model",
  incomeType: "房租收入",
  amountDue: 350,
  amountPaid: 0,
  amountUnpaid: 350,
  paymentStatus: "未收",
  coverageStartDate: "2026-08-01",
  coverageEndDate: "2026-08-20",
  ...overrides
} as BusinessRentPayment);

function debtCases(p: BusinessRentPayment, today: string) {
  return getDebtCases({
    properties: [{ id: "property-model", name: "模型房源", address: "", city: "" }],
    rooms: [{ id: "room-model", propertyId: "property-model", name: "01", roomNumber: "01", monthlyRent: 350, depositAmount: 0, status: "已租" }],
    tenants: [tenant()],
    rentPayments: [p],
    today
  });
}

test("coverage end is inclusive: debt starts on the following day", () => {
  assert.equal(debtCases(payment(), "2026-08-20").length, 0);
  assert.equal(debtCases(payment(), "2026-08-21")[0]?.remainingAmount, 350);
});

test("partial and fully paid periods use actual paid amount without changing overdue facts", () => {
  assert.equal(debtCases(payment({ amountPaid: 100, amountUnpaid: 250 }), "2026-08-21")[0]?.remainingAmount, 250);
  assert.equal(debtCases(payment({ amountPaid: 350, amountUnpaid: 0, paymentStatus: "已收" }), "2026-08-21").length, 0);
});

test("payment day does not create debt while coverage is still active", () => {
  const state = getRentPeriodState({ tenant: tenant(5), payment: payment({ coverageEndDate: "2026-08-20" }), today: "2026-08-10" });
  assert.equal(state.isExpired, false);
  assert.equal(state.hasOpenDebtFollowUp, false);
  assert.equal(debtCases(payment({ coverageEndDate: "2026-08-20" }), "2026-08-10").length, 0);
});

test("payment-day timing can be overdue without becoming a debt case", () => {
  const timing = rentCollectionReminderStage(tenant(5), null, "2026-08-10");
  assert.equal(timing?.reason, "payment_day");
  assert.equal(timing?.level, "critical");
  const state = getRentPeriodState({ tenant: tenant(5), payment: null, today: "2026-08-10" });
  assert.equal(state.hasOpenDebtFollowUp, false);
});

test("overdue without debt is not waivable, while positive debt is collecting and waivable", () => {
  const zero = payment({ amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const zeroState = getRentPeriodState({ tenant: tenant(), payment: zero, today: "2026-08-21" });
  assert.equal(zeroState.isExpired, true);
  assert.equal(zeroState.remainingAmount, 0);
  assert.equal(zeroState.canWaive, false);
  const positiveState = getRentPeriodState({ tenant: tenant(), payment: payment(), today: "2026-08-21" });
  assert.equal(positiveState.hasOpenDebtFollowUp, true);
  assert.equal(positiveState.canWaive, true);
});
