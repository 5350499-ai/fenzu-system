import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { getDebtCases, getOutstandingReceivableAmount } from "../lib/debt-case.ts";

const profitSource = readFileSync("lib/profit.ts", "utf8");

const property = { id: "property-accounting", name: "账务测试房源" } as BusinessProperty;
const room = { id: "room-accounting", propertyId: property.id, name: "01", roomNumber: "01", status: "已租" } as BusinessRoom;
const tenant = { id: "tenant-accounting", name: "账务测试租客", propertyId: property.id, roomId: room.id, status: "在租", monthlyRent: 500 } as BusinessTenant;
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-accounting",
  tenantId: tenant.id,
  propertyId: property.id,
  roomId: room.id,
  incomeType: "房租收入",
  paymentStatus: "已收",
  amountDue: 500,
  amountPaid: 500,
  amountUnpaid: 0,
  paymentDate: "2026-08-10",
  rentMonth: "2026-08",
  coverageStartDate: "2026-08-01",
  coverageEndDate: "2026-08-31",
  notes: "",
  ...overrides
} as BusinessRentPayment);

function snapshot(rentPayment: BusinessRentPayment, waivedPaymentIds = new Set<string>()) {
  return { properties: [property], rooms: [room], tenants: [tenant], rentPayments: [rentPayment], waivedPaymentIds, today: "2026-09-01" };
}

test("actual income is amountPaid and active receivable is the remaining amount", () => {
  const partial = payment({ amountPaid: 300, amountUnpaid: 200, paymentStatus: "部分收款", coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" });
  assert.match(profitSource, /export function rentIncomeForPayment[\s\S]*?return Number\(payment\.amountPaid \|\| 0\)/);
  assert.equal(Number(partial.amountPaid), 300);
  assert.equal(getOutstandingReceivableAmount(snapshot(partial)), 200);
});

test("waiving a receivable closes collection without changing income or expense", () => {
  const partial = payment({ amountPaid: 300, amountUnpaid: 200, paymentStatus: "部分收款", coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" });
  assert.match(profitSource, /const expense = sumBy\(scopedExpenses, "amount"\)/);
  assert.equal(Number(partial.amountPaid), 300);
  assert.equal(getOutstandingReceivableAmount(snapshot(partial)), 200);
  assert.equal(getOutstandingReceivableAmount(snapshot(partial, new Set([partial.id]))), 0);
  assert.equal(partial.amountPaid, 300);
  assert.equal(partial.amountDue, 500);
});

test("zero-balance overdue coverage is not a waiver candidate", () => {
  const zero = payment({ amountDue: 0, amountPaid: 0, amountUnpaid: 0, coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" });
  const [debt] = getDebtCases(snapshot(zero));
  assert.equal(debt, undefined);
});
