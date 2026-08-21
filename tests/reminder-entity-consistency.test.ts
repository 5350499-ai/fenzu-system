import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { buildEffectiveReminders } from "../lib/reminder-engine.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { validateReminderEntityConsistency } from "../lib/reminder-entity-consistency.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { resolveTenantNavigationContext } from "../lib/reminder-navigation.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getDebtCases, getTenantDebtCases } from "../lib/debt-case.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getTenantDebtDisplay } from "../lib/tenant-debt-display.ts";

const TODAY = "2026-08-11";
const propertyOld = { id: "property-old", name: "旧房源", address: "", city: "" } as BusinessProperty;
const propertyNew = { id: "property-new", name: "新房源", address: "", city: "" } as BusinessProperty;
const roomOld = { id: "room-old", propertyId: propertyOld.id, name: "01", roomNumber: "01", status: "已租" } as BusinessRoom;
const roomNew = { id: "room-new", propertyId: propertyNew.id, name: "02", roomNumber: "02", status: "已租" } as BusinessRoom;

const tenantA = { id: "tenant-a", propertyId: propertyNew.id, roomId: roomNew.id, name: "同名租客", status: "已退租" } as BusinessTenant;
const tenantB = { id: "tenant-b", propertyId: propertyOld.id, roomId: roomOld.id, name: "同名租客", status: "在租" } as BusinessTenant;
const paymentA = { id: "payment-a", tenantId: tenantA.id, propertyId: propertyOld.id, roomId: roomOld.id, incomeType: "房租收入", paymentStatus: "未收", amountDue: 100, amountPaid: 0, amountUnpaid: 100, coverageStartDate: "2026-07-01", coverageEndDate: "2026-08-01", rentMonth: "2026-07", isOverdue: true } as BusinessRentPayment;
const paymentB = { id: "payment-b", tenantId: tenantB.id, propertyId: propertyOld.id, roomId: roomOld.id, incomeType: "房租收入", paymentStatus: "未收", amountDue: 100, amountPaid: 0, amountUnpaid: 100, coverageStartDate: "2026-07-01", coverageEndDate: "2026-08-01", rentMonth: "2026-07", isOverdue: true } as BusinessRentPayment;

test("rent reminders preserve payment-owned tenant, property and room across move-out and re-let history", () => {
  const snapshot = { properties: [propertyOld, propertyNew], rooms: [roomOld, roomNew], tenants: [tenantA, tenantB], contracts: [], rentPayments: [paymentA, paymentB], deposits: [], waivedPaymentIds: new Set<string>(), includeBackupReminder: false, today: TODAY };
  const reminders = buildEffectiveReminders(snapshot);
  assert.deepEqual(validateReminderEntityConsistency(reminders, snapshot), []);
  assert.equal(reminders.filter((item) => item.type === "rent_debt").length, 2);
  const oldDebt = reminders.find((item) => item.paymentId === paymentA.id);
  assert.equal(oldDebt?.tenantId, tenantA.id);
  assert.equal(oldDebt?.roomId, roomOld.id);
  assert.equal(oldDebt?.propertyId, propertyOld.id);
  assert.equal(oldDebt?.debtCase?.tenantName, tenantA.name);
  assert.equal(resolveTenantNavigationContext(oldDebt!.href)?.tenantId, tenantA.id);
});

test("multiple periods, payment-specific waivers, voids and zero overdue events keep their own subject", () => {
  const oldWaived = { ...paymentB, id: "payment-b-old", amountDue: 120, amountUnpaid: 120, coverageEndDate: "2026-06-30", createdAt: "2026-06-01" };
  const latestOpen = { ...paymentB, id: "payment-b-open", amountDue: 80, amountUnpaid: 80, coverageEndDate: "2026-08-01", createdAt: "2026-08-01" };
  const voidPayment = { ...paymentA, id: "payment-void", paymentStatus: "已作废", createdAt: "2026-09-01" };
  const zeroPayment = { ...paymentA, id: "payment-zero", amountDue: 0, amountPaid: 0, amountUnpaid: 0, createdAt: "2026-08-02" };
  const snapshot = {
    properties: [propertyOld, propertyNew], rooms: [roomOld, roomNew], tenants: [tenantA, tenantB], contracts: [],
    rentPayments: [oldWaived, latestOpen, voidPayment, zeroPayment], deposits: [], waivedPaymentIds: new Set([oldWaived.id]), includeBackupReminder: false, today: TODAY
  };
  const reminders = buildEffectiveReminders(snapshot);
  assert.deepEqual(validateReminderEntityConsistency(reminders, snapshot), []);
  assert.equal(reminders.some((item) => item.paymentId === oldWaived.id), false);
  assert.equal(reminders.some((item) => item.paymentId === voidPayment.id), false);
  assert.equal(reminders.some((item) => item.paymentId === latestOpen.id), true);
  assert.equal(reminders.some((item) => item.paymentId === zeroPayment.id), false);
});

test("archive mutes a debt without changing the payment entity and similar names stay ID-bound", () => {
  const archived = { ...tenantA, status: "已归档" };
  const thirdProperty = { id: "property-three", name: "旧房源", address: "", city: "" } as BusinessProperty;
  const thirdRoom = { id: "room-three", propertyId: thirdProperty.id, name: "10", roomNumber: "10", status: "已租" } as BusinessRoom;
  const tenantC = { id: "tenant-c", propertyId: thirdProperty.id, roomId: thirdRoom.id, name: tenantA.name, status: "在租" } as BusinessTenant;
  const paymentC = { ...paymentB, id: "payment-c", tenantId: tenantC.id, propertyId: thirdProperty.id, roomId: thirdRoom.id };
  const snapshot = { properties: [propertyOld, propertyNew, thirdProperty], rooms: [roomOld, roomNew, thirdRoom], tenants: [archived, tenantB, tenantC], contracts: [], rentPayments: [paymentA, paymentB, paymentC], deposits: [], waivedPaymentIds: new Set<string>(), includeBackupReminder: false, today: TODAY };
  const reminders = buildEffectiveReminders(snapshot);
  assert.deepEqual(validateReminderEntityConsistency(reminders, snapshot), []);
  assert.equal(reminders.some((item) => item.paymentId === paymentA.id), false);
  assert.equal(reminders.find((item) => item.paymentId === paymentC.id)?.tenantId, tenantC.id);
});

test("tenant-list rent labels consume the same RentPeriodState and payment-specific waiver facts", () => {
  const base = { properties: [propertyOld], rooms: [roomOld], tenants: [tenantB], rentPayments: [paymentB], today: TODAY };
  const openCases = getDebtCases(base);
  const waivedCases = getDebtCases({ ...base, waivedPaymentIds: new Set([paymentB.id]) });
  const upcomingPayment = { ...paymentB, coverageEndDate: "2026-08-15" };
  const upcomingCases = getDebtCases({ ...base, rentPayments: [upcomingPayment] });
  const open = getTenantDebtDisplay({ tenant: tenantB, payments: [paymentB], debtCases: getTenantDebtCases(tenantB.id, openCases), today: TODAY });
  const waived = getTenantDebtDisplay({ tenant: tenantB, payments: [paymentB], debtCases: getTenantDebtCases(tenantB.id, waivedCases), waivedPaymentIds: new Set([paymentB.id]), today: TODAY });
  const upcoming = getTenantDebtDisplay({ tenant: tenantB, payments: [upcomingPayment], debtCases: getTenantDebtCases(tenantB.id, upcomingCases), today: TODAY });
  assert.equal(open.displayStatus, "欠租");
  assert.equal(open.expiry.label, "已逾期10天");
  assert.equal(waived.displayStatus, "在租");
  assert.equal(waived.expiry.label, "");
  assert.equal(upcoming.displayStatus, "在租");
  assert.equal(upcoming.expiry.label, "即将到期4天");
});
