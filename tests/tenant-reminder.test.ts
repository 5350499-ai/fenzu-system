import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { getDebtCases } from "../lib/debt-case.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { tenantDebtHref, tenantReminderHref } from "../lib/reminder-navigation.ts";

const tenant = (status = "在租") => ({ id: "tenant-1", name: "Tenant", status, propertyId: "property-1", roomId: "room-1" } as BusinessTenant);
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({ id: "payment-1", tenantId: "tenant-1", propertyId: "property-1", roomId: "room-1", incomeType: "房租收入", amountDue: 500, amountPaid: 0, amountUnpaid: 500, coverageStartDate: "2026-07-01", coverageEndDate: "2026-08-01", paymentStatus: "未收", notes: "", ...overrides } as BusinessRentPayment);
function cases(status = "在租", overrides: Partial<BusinessRentPayment> = {}, waivedPaymentIds = new Set<string>()) {
  return getDebtCases({ properties: [{ id: "property-1", name: "P", address: "", city: "" }], rooms: [{ id: "room-1", propertyId: "property-1", name: "01", roomNumber: "01", status: "已租", monthlyRent: 0, depositAmount: 0 }], tenants: [tenant(status)], rentPayments: [payment(overrides)], waivedPaymentIds, today: "2026-08-11" });
}
test("tenant and debt navigation retain stable tenant and payment IDs", () => {
  assert.equal(tenantReminderHref("tenant/1"), "/tenants?tenantId=tenant%2F1");
  assert.equal(tenantDebtHref("tenant/1", "payment/1"), "/tenants?tenantId=tenant%2F1&paymentId=payment%2F1&focus=debt");
});
test("DebtCase keeps archive/move-out facts separate from reminder presentation", () => {
  assert.equal(cases().length, 1);
  assert.equal(cases("已退租")[0]?.tenantLifecycle, "moved_out");
  assert.equal(cases("已归档")[0]?.tenantLifecycle.startsWith("archived"), true);
  assert.equal(cases("在租", {}, new Set(["payment-1"])).length, 0);
});
test("zero overdue debt remains waivable but not collectible", () => {
  const debtCase = cases("在租", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 })[0];
  assert.equal(debtCase?.canCollect, false);
  assert.equal(debtCase?.canWaive, true);
});
