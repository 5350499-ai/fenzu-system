import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getLatestRentPeriodState, getOpenRentDebtPeriodStates } from "../lib/rent-period-state.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { buildEffectiveReminders } from "../lib/reminder-engine.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getDebtCases, getTenantDebtCases } from "../lib/debt-case.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { getTenantDebtDisplay } from "../lib/tenant-debt-display.ts";

const TODAY = "2026-08-11";
const tenant = { id: "tenant-test", propertyId: "property-1", roomId: "room-1", name: "Test", status: "在租" } as BusinessTenant;
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-current",
  tenantId: tenant.id,
  propertyId: "property-1",
  roomId: "room-1",
  incomeType: "房租收入",
  paymentStatus: "已收",
  amountDue: 100,
  amountPaid: 100,
  amountUnpaid: 0,
  coverageStartDate: "2026-08-01",
  coverageEndDate: "2026-08-12",
  createdAt: "2026-08-01T10:00:00.000Z",
  notes: "",
  ...overrides
} as BusinessRentPayment);

function snapshot(rentPayments: BusinessRentPayment[], waivedPaymentIds = new Set<string>()) {
  return {
    properties: [{ id: "property-1", name: "测试房源", address: "", city: "" }],
    rooms: [{ id: "room-1", propertyId: "property-1", name: "01", roomNumber: "01", status: "已租", monthlyRent: 0, depositAmount: 0 }],
    tenants: [tenant], contracts: [], rentPayments, deposits: [], waivedPaymentIds, includeBackupReminder: false, today: TODAY
  };
}

test("current period and an older open debt are selected independently and explained consistently", () => {
  const olderDebt = payment({
    id: "payment-old-debt", paymentStatus: "未收", amountDue: 100, amountPaid: 0, amountUnpaid: 100,
    coverageStartDate: "2026-06-01", coverageEndDate: "2026-06-30", createdAt: "2026-06-01T10:00:00.000Z"
  });
  const currentUpcoming = payment();
  const latest = getLatestRentPeriodState({ tenant, payments: [olderDebt, currentUpcoming], today: TODAY });
  const openDebtPeriods = getOpenRentDebtPeriodStates({ tenant, payments: [olderDebt, currentUpcoming], today: TODAY });
  const reminders = buildEffectiveReminders(snapshot([olderDebt, currentUpcoming]));
  const debtCases = getDebtCases(snapshot([olderDebt, currentUpcoming]));
  const display = getTenantDebtDisplay({ tenant, payments: [olderDebt, currentUpcoming], debtCases: getTenantDebtCases(tenant.id, debtCases), today: TODAY });

  assert.equal(latest.paymentId, currentUpcoming.id);
  assert.deepEqual(openDebtPeriods.map((state) => state.paymentId), [olderDebt.id]);
  assert.deepEqual(reminders.filter((item) => item.type === "rent_debt").map((item) => item.paymentId), [olderDebt.id]);
  assert.equal(display.expiry.label, "即将到期1天");
  assert.equal(display.hasHistoricalOpenDebt, true);
  assert.equal(display.historicalDebtLabel, "历史欠费");
});

test("a payment-specific waiver removes only that historical open debt while the current period stays upcoming", () => {
  const olderZeroDebt = payment({
    id: "payment-old-zero", paymentStatus: "未收", amountDue: 0, amountPaid: 0, amountUnpaid: 0,
    coverageStartDate: "2026-06-01", coverageEndDate: "2026-06-30", createdAt: "2026-06-01T10:00:00.000Z"
  });
  const currentUpcoming = payment();
  const waivedPaymentIds = new Set([olderZeroDebt.id]);
  const openDebtPeriods = getOpenRentDebtPeriodStates({ tenant, payments: [olderZeroDebt, currentUpcoming], today: TODAY, waivedPaymentIds });
  const reminders = buildEffectiveReminders(snapshot([olderZeroDebt, currentUpcoming], waivedPaymentIds));
  const debtCases = getDebtCases(snapshot([olderZeroDebt, currentUpcoming], waivedPaymentIds));
  const display = getTenantDebtDisplay({ tenant, payments: [olderZeroDebt, currentUpcoming], debtCases: getTenantDebtCases(tenant.id, debtCases), today: TODAY, waivedPaymentIds });

  assert.deepEqual(openDebtPeriods.map((state) => state.paymentId), []);
  assert.equal(reminders.some((item) => item.paymentId === olderZeroDebt.id), false);
  assert.equal(display.expiry.label, "即将到期1天");
  assert.equal(display.hasHistoricalOpenDebt, false);
});
