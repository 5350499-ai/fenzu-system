import assert from "node:assert/strict";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data";
import { buildTenantTimeline, calculatePaymentDueDate, calculateTenantPaymentPerformance, classifyPaymentDelay } from "../lib/tenant-timeline";

const tenant: BusinessTenant = { id: "t1", propertyId: "p1", roomId: "r1", name: "测试", phone: "", wechat: "", source: "其他", monthlyRent: 300, depositAmount: 0, paymentDay: 20, status: "在租" };
const payment = (overrides: Partial<BusinessRentPayment> = {}): BusinessRentPayment => ({ id: "p1", propertyId: "p1", roomId: "r1", tenantId: "t1", incomeType: "房租收入", rentMonth: "2026-08", paymentDate: "2026-08-20", amountDue: 300, amountPaid: 300, amountUnpaid: 0, coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31", paymentStatus: "已收", paymentMethod: "转账", isOverdue: false, ...overrides });

assert.equal(calculatePaymentDueDate(payment(), tenant), "2026-08-20");
assert.equal(calculatePaymentDueDate(payment({ rentMonth: "2028-02", coverageStartDate: "2028-02-01", coverageEndDate: "2028-02-29" }), { ...tenant, paymentDay: 31 }), "2028-02-29");
assert.equal(classifyPaymentDelay("2026-08-20", "2026-08-20").days, 0);
assert.equal(classifyPaymentDelay("2026-08-24", "2026-08-20").level, "yellow");
assert.equal(classifyPaymentDelay("2026-08-30", "2026-08-20").level, "red");
assert.equal(classifyPaymentDelay("2026-08-14", "2026-08-20").days, 0);

const performance = calculateTenantPaymentPerformance(tenant, [payment(), payment({ id: "p2", paymentDate: "2026-07-24", rentMonth: "2026-07", coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" })], "2026-09-01");
assert.equal(performance.lateCount, 1);
assert.equal(performance.averageLateDays, 2);
assert.equal(performance.longestLateDays, 4);
assert.equal(performance.onTimeRate, 50);

const excluded = calculateTenantPaymentPerformance(tenant, [payment({ coverageStartDate: "2026-08-15", amountDue: 150 })], "2026-09-01");
assert.equal(excluded.periods.length, 0);
assert.equal(excluded.excludedCount, 1);

const overdue = calculateTenantPaymentPerformance(tenant, [payment({ paymentStatus: "未收", amountPaid: 0, amountUnpaid: 300, coverageEndDate: "2026-07-31" })], "2026-08-05");
assert.equal(overdue.currentOverdueDays, 5);
assert.equal(calculateTenantPaymentPerformance({ ...tenant, status: "已退租" }, [payment({ paymentStatus: "未收", amountPaid: 0, amountUnpaid: 300, coverageEndDate: "2026-07-31" })], "2026-08-05").currentOverdueDays, null);

const timeline = buildTenantTimeline({ ...tenant, moveInDate: "2026-07-01" }, undefined, [payment()], [], "2026-09-01");
assert.equal(timeline.filter((event) => event.id === "p1").length, 1);
assert.equal(timeline[0].date, "2026-08-20");

console.log("tenant timeline tests passed");
