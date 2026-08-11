import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { getDebtCases } from "../lib/debt-case.ts";

const tenant = (status = "在租") => ({ id: "tenant-policy", name: "Policy", status, propertyId: "property-1", roomId: "room-1" } as BusinessTenant);
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({ id: "payment-policy", tenantId: "tenant-policy", propertyId: "property-1", roomId: "room-1", incomeType: "房租收入", amountDue: 100, amountPaid: 0, amountUnpaid: 100, coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31", ...overrides } as BusinessRentPayment);
function cases(status = "在租", p = payment(), waivedPaymentIds = new Set<string>()) { return getDebtCases({ properties: [{ id: "property-1", name: "P", address: "", city: "" }], rooms: [{ id: "room-1", propertyId: "property-1", name: "01", roomNumber: "01", monthlyRent: 0, depositAmount: 0, status: "已租" }], tenants: [tenant(status)], rentPayments: [p], waivedPaymentIds, today: "2026-08-11" }); }
test("archive and move-out do not settle the same payment-specific DebtCase", () => {
  assert.equal(cases().length, 1);
  assert.equal(cases("已退租").length, 1);
  assert.equal(cases("已归档").length, 1);
});
test("waiver closes only its payment-specific DebtCase without changing money", () => {
  const p = payment();
  assert.equal(cases("在租", p, new Set([p.id])).length, 0);
  assert.equal(p.amountDue, 100);
  assert.equal(p.amountPaid, 0);
});
