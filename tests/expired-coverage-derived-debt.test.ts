import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { getDebtCases, getOutstandingReceivableAmount } from "../lib/debt-case.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { buildEffectiveReminders } from "../lib/reminder-engine.ts";

const property = { id: "property-derived", name: "Derived House" } as BusinessProperty;
const room = { id: "room-derived", propertyId: property.id, name: "01", roomNumber: "01", monthlyRent: 0, depositAmount: 0, status: "已租" } as BusinessRoom;
const tenant = { id: "tenant-derived", propertyId: property.id, roomId: room.id, name: "派生测试租客", status: "在租", monthlyRent: 350 } as BusinessTenant;
const priorPayment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-prior",
  tenantId: tenant.id,
  propertyId: property.id,
  roomId: room.id,
  incomeType: "房租收入",
  paymentStatus: "已收",
  amountDue: 350,
  amountPaid: 350,
  amountUnpaid: 0,
  coverageStartDate: "2026-07-01",
  coverageEndDate: "2026-07-31",
  rentMonth: "2026-07",
  ...overrides
} as BusinessRentPayment);

function snapshot(today: string, payments = [priorPayment()]) {
  return { properties: [property], rooms: [room], tenants: [tenant], rentPayments: payments, today };
}

test("expired coverage without a next payment derives one receivable period", () => {
  const [debt] = getDebtCases(snapshot("2026-08-21"));
  assert.equal(debt?.isDerived, true);
  assert.equal(debt?.remainingAmount, 350);
  assert.equal(debt?.amountPaid, 0);
  assert.equal(debt?.daysOverdue, 21);
});

test("multiple missed monthly periods accumulate without creating payment rows", () => {
  const cases = getDebtCases(snapshot("2026-09-21"));
  assert.equal(cases.length, 2);
  assert.equal(cases.reduce((sum, item) => sum + item.remainingAmount, 0), 700);
  assert.equal(cases.every((item) => item.isDerived), true);
});

test("an existing partial payment remains the sole source for its period", () => {
  const partial = priorPayment({ amountPaid: 100, amountUnpaid: 250, amountDue: 350, paymentStatus: "部分收款", coverageEndDate: "2026-08-20", coverageStartDate: "2026-08-01" });
  const cases = getDebtCases(snapshot("2026-08-21", [partial]));
  assert.equal(cases.length, 1);
  assert.equal(cases[0]?.isDerived, false);
  assert.equal(cases[0]?.remainingAmount, 250);
});

test("derived debt feeds reminders and receivables but not income", () => {
  const base = snapshot("2026-08-21");
  const cases = getDebtCases(base);
  const reminders = buildEffectiveReminders({ ...base, contracts: [], deposits: [] });
  assert.equal(getOutstandingReceivableAmount(base), 350);
  assert.equal(cases[0]?.amountPaid, 0);
  assert.equal(reminders.filter((item) => item.type === "rent_debt").length, 1);
  assert.equal(new Set(reminders.filter((item) => item.type === "rent_debt").map((item) => item.id)).size, 1);
});

test("waiver identity is stable and excludes the derived case", () => {
  const [debt] = getDebtCases(snapshot("2026-08-21"));
  assert.ok(debt);
  const waived = getDebtCases({ ...snapshot("2026-08-21"), waivedPaymentIds: new Set([debt.paymentId]) });
  assert.equal(waived.length, 0);
});
