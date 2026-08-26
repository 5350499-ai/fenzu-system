import assert from "node:assert/strict";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data";
import { buildCalendarYearMonths, buildMonthlyPaymentStatus, buildMonthlyRentIncome, buildPaymentDelayTrend, buildTenantMonthRange, buildTenantTimeline, calculateMonthlyPaymentStatusDays, calculatePaymentDueDate, calculateTenantPaymentPerformance, classifyPaymentDelay, diagnoseTenantRentPayments, formatPaymentCycleLabel, getRentAttributionMonth, groupTimelineEventsByDate, isCompleteNaturalMonthCoverage, rentAmountFromRecord } from "../lib/tenant-timeline";

const tenant: BusinessTenant = { id: "t1", propertyId: "p1", roomId: "r1", name: "测试", phone: "", wechat: "", source: "其他", monthlyRent: 300, depositAmount: 0, occupantCount: 1, paymentDay: 20, status: "在租" };
const payment = (overrides: Partial<BusinessRentPayment> = {}): BusinessRentPayment => ({ id: "p1", propertyId: "p1", roomId: "r1", tenantId: "t1", incomeType: "房租收入", rentMonth: "2026-08", paymentDate: "2026-08-20", amountDue: 300, amountPaid: 300, amountUnpaid: 0, coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31", paymentStatus: "已收", paymentMethod: "转账", isOverdue: false, ...overrides });

assert.equal(calculatePaymentDueDate(payment(), tenant), "2026-08-20");
assert.equal(calculatePaymentDueDate(payment({ rentMonth: "2028-02", coverageStartDate: "2028-02-01", coverageEndDate: "2028-02-29" }), { ...tenant, paymentDay: 31 }), "2028-02-29");
assert.equal(classifyPaymentDelay("2026-08-20", "2026-08-20").days, 0);
assert.equal(classifyPaymentDelay("2026-08-24", "2026-08-20").level, "yellow");
assert.equal(classifyPaymentDelay("2026-08-21", "2026-08-20").level, "yellow");
assert.equal(classifyPaymentDelay("2026-08-30", "2026-08-20").level, "red");
assert.equal(classifyPaymentDelay("2026-08-14", "2026-08-20").days, 0);

const performance = calculateTenantPaymentPerformance(tenant, [payment(), payment({ id: "p2", paymentDate: "2026-08-03", rentMonth: "2026-07", coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" })], "2026-09-01");
assert.equal(performance.lateCount, 2);
assert.equal(performance.averageLateDays, 26);
assert.equal(performance.longestLateDays, 33);
assert.equal(performance.onTimeRate, 0);
assert.equal(formatPaymentCycleLabel(payment()), "2026年8月");
assert.deepEqual(buildPaymentDelayTrend(performance.periods).map((point) => point.payment.id), ["p2", "p1"]);
const manyPeriods = Array.from({ length: 13 }, (_, index) => ({ payment: payment({ id: `p${index}`, rentMonth: `2026-${String(index + 1).padStart(2, "0")}`, coverageStartDate: `2026-${String(index + 1).padStart(2, "0")}-01`, coverageEndDate: `2026-${String(index + 1).padStart(2, "0")}-28` }), delay: { included: true, days: index % 2, level: "on-time" as const, dueDate: `2026-${String(index + 1).padStart(2, "0")}-20`, paymentDate: `2026-${String(index + 1).padStart(2, "0")}-20` } }));
assert.equal(buildPaymentDelayTrend(manyPeriods).length, 12);
assert.equal(buildPaymentDelayTrend(manyPeriods, 12, true).length, 13);

const excluded = calculateTenantPaymentPerformance(tenant, [payment({ coverageStartDate: "2026-08-15", amountDue: 150 })], "2026-09-01");
assert.equal(excluded.periods.length, 0);
assert.equal(excluded.excludedCount, 1);

const overdue = calculateTenantPaymentPerformance(tenant, [payment({ paymentStatus: "未收", amountPaid: 0, amountUnpaid: 300, coverageEndDate: "2026-07-31" })], "2026-08-05");
assert.equal(overdue.currentOverdueDays, 5);
assert.equal(calculateTenantPaymentPerformance({ ...tenant, status: "已退租" }, [payment({ paymentStatus: "未收", amountPaid: 0, amountUnpaid: 300, coverageEndDate: "2026-07-31" })], "2026-08-05").currentOverdueDays, null);

const timeline = buildTenantTimeline({ ...tenant, moveInDate: "2026-07-01" }, undefined, [payment()], [], "2026-09-01");
assert.equal(timeline.filter((event) => event.id === "p1").length, 1);
assert.equal(timeline[0].date, "2026-08-20");
assert.deepEqual(groupTimelineEventsByDate([{ id: "new", date: "2026-08-20", type: "房租收款", title: "房租收款" }, { id: "old", date: "2026-07-18", type: "押金", title: "押金收取" }, { id: "same", date: "2026-07-18", type: "入住", title: "入住" }]).map((group) => [group.date, group.events.length]), [["2026-07-18", 2], ["2026-08-20", 1]]);

const monthly = buildMonthlyPaymentStatus(tenant, [
  payment({ id: "m1", rentMonth: "2026-07", paymentDate: "2026-07-20", coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" }),
  payment({ id: "m2", rentMonth: "2026-08", paymentDate: "2026-08-25", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" }),
  payment({ id: "m3", rentMonth: "2026-09", paymentDate: "2026-09-30", coverageStartDate: "2026-09-01", coverageEndDate: "2026-09-30" })
], [], "2026-10-01");
assert.deepEqual(monthly.map((point) => point.month), ["2026-07", "2026-08", "2026-09"]);
assert.equal(monthly[0].status, "late-red");
assert.equal(monthly[1].status, "late-red");
assert.equal(monthly[2].status, "late-red");
const income = buildMonthlyRentIncome([payment({ id: "a", paymentDate: "2026-08-05", amountDue: 100, amountPaid: 100 }), payment({ id: "b", paymentDate: "2026-08-20", amountDue: 200, amountPaid: 200 }), payment({ id: "deposit", paymentDate: "2026-08-21", incomeType: "押金收入", amountDue: 0, amountPaid: 300 })]);
assert.equal(income.length, 1);
assert.equal(income[0].amount, 600);
assert.equal(buildMonthlyRentIncome([payment({ paymentDate: "2026-07-31", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31", amountDue: 350, amountPaid: 350 })])[0].month, "2026-07");
assert.equal(buildMonthlyRentIncome([payment({ paymentDate: "2026-07-05", coverageStartDate: "2026-07-01", coverageEndDate: "2026-08-31", amountDue: 999, amountPaid: 480 })])[0].amount, 480);
assert.equal(buildMonthlyRentIncome([payment({ paymentDate: "2026-07-29", coverageStartDate: "2026-07-29", coverageEndDate: "2026-08-29", amountDue: 460, amountPaid: 460 })])[0].month, "2026-07");
assert.equal(buildMonthlyRentIncome([payment({ amountDue: 130, amountPaid: 430, paymentDate: "2026-07-18", coverageStartDate: "2026-07-18", coverageEndDate: "2026-07-31" })])[0].amount, 430);
assert.equal(rentAmountFromRecord(payment({ amountDue: 430, amountPaid: 810 })), 430);
const audited = diagnoseTenantRentPayments([
  payment({ id: "tenant-503-rent-480", amountDue: 480, amountPaid: 480, coverageStartDate: "2026-06-01", coverageEndDate: "2026-06-30" }),
  payment({ id: "tenant-503-rent-430", amountDue: 430, amountPaid: 810, coverageStartDate: "2026-07-01", coverageEndDate: "2026-07-31" })
]);
assert.deepEqual(audited.map((item) => [item.attributionMonth, item.rentAmount, item.amountIncluded]), [["2026-06", 480, true], ["2026-07", 430, true]]);
assert.equal(buildMonthlyPaymentStatus(tenant, [payment({ coverageStartDate: "2026-08-15", amountDue: 150 })], [], "2026-09-01")[0].status, "untracked");
assert.deepEqual(buildTenantMonthRange({ ...tenant, moveInDate: "2026-07-18" }, [], [], "2026-12-05"), ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
assert.deepEqual(buildTenantMonthRange({ ...tenant, moveInDate: "2026-07-18", actualMoveOutDate: "2026-09-03" }, [], [], "2026-12-05"), ["2026-07", "2026-08", "2026-09"]);
assert.equal(buildCalendarYearMonths(2026).length, 12);
assert.deepEqual(buildCalendarYearMonths(2026).slice(0, 3), ["2026-01", "2026-02", "2026-03"]);
assert.equal(calculateMonthlyPaymentStatusDays("2026-08", [payment({ paymentDate: "2026-07-29", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })], "2026-09-01", 300), 3);
assert.equal(calculateMonthlyPaymentStatusDays("2026-08", [payment({ paymentDate: "2026-07-30", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })], "2026-09-01", 300), 2);
assert.equal(calculateMonthlyPaymentStatusDays("2026-08", [payment({ paymentDate: "2026-07-31", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })], "2026-09-01", 300), 1);
assert.equal(calculateMonthlyPaymentStatusDays("2026-08", [payment({ paymentDate: "2026-08-01", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })], "2026-09-01", 300), 0);
assert.equal(calculateMonthlyPaymentStatusDays("2026-08", [payment({ paymentDate: "2026-08-03", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })], "2026-09-04", 300), -2);

assert.equal(getRentAttributionMonth(payment({ paymentDate: "2026-07-31", coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })), "2026-08");
assert.equal(isCompleteNaturalMonthCoverage(payment({ coverageStartDate: "2026-08-01", coverageEndDate: "2026-08-31" })), true);
assert.equal(isCompleteNaturalMonthCoverage(payment({ coverageStartDate: "2026-07-18", coverageEndDate: "2026-07-31", amountDue: 130, amountPaid: 130 })), false);
assert.equal(getRentAttributionMonth(payment({ coverageStartDate: "2026-07-01", coverageEndDate: "2026-08-31" })), "2026-07");
assert.equal(calculateMonthlyPaymentStatusDays("2026-07", [payment({ paymentDate: "2026-07-18", coverageStartDate: "2026-07-18", coverageEndDate: "2026-07-31", amountDue: 130, amountPaid: 130 })], "2026-08-01", 300), null);
assert.equal(calculateMonthlyPaymentStatusDays("2026-08", [payment({ id: "part-1", paymentDate: "2026-08-10", amountPaid: 100 }), payment({ id: "part-2", paymentDate: "2026-08-20", amountPaid: 200 })], "2026-09-01", 300), -19);
console.log("tenant timeline tests passed");
