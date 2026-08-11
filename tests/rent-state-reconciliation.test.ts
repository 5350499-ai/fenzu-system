import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { inspectTenantRentState } from "../lib/rent-period-state.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { buildEffectiveReminders } from "../lib/reminder-engine.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { getTenantRentDisplay } from "../lib/tenant-rent-state-display.ts";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { buildRentReminderDisplay } from "../lib/rent-reminder-display.ts";

const TODAY = "2026-08-11";
const property = { id: "property-1", name: "测试房源", address: "", city: "" } as BusinessProperty;
const room = { id: "room-1", propertyId: property.id, name: "02 房间", roomNumber: "02", status: "已租" } as BusinessRoom;
const tenant = (id = "tenant-1", name = "欠费2", status = "在租") => ({ id, name, status, propertyId: property.id, roomId: room.id, monthlyRent: 100 } as BusinessTenant);
const payment = (tenantId: string, id: string, coverageEndDate: string, overrides: Partial<BusinessRentPayment> = {}) => ({
  id, tenantId, propertyId: property.id, roomId: room.id, incomeType: "房租收入", paymentStatus: "未收",
  amountDue: 100, amountPaid: 0, amountUnpaid: 100, coverageStartDate: "2026-08-01", coverageEndDate, createdAt: "2026-08-01T00:00:00.000Z", notes: "", ...overrides
} as BusinessRentPayment);

function snapshot(tenants: BusinessTenant[], rentPayments: BusinessRentPayment[], waivedPaymentIds = new Set<string>()) {
  return { properties: [property], rooms: [room], tenants, contracts: [], rentPayments, deposits: [], waivedPaymentIds, includeBackupReminder: false, today: TODAY };
}

function assertChain(target: BusinessTenant, payments: BusinessRentPayment[], expectedLatest: string | null, expectedOpen: string[], waivedPaymentIds = new Set<string>()) {
  const report = inspectTenantRentState({ tenant: target, payments, waivedPaymentIds, today: TODAY });
  const display = getTenantRentDisplay({ tenant: target, payments, waivedPaymentIds, today: TODAY });
  const reminders = buildEffectiveReminders(snapshot([target], payments, waivedPaymentIds));
  assert.equal(report.latestPeriod.paymentId, expectedLatest);
  assert.deepEqual(report.openDebtPeriods.map((state) => state.paymentId), expectedOpen);
  assert.deepEqual(report.expectedReminderIds, expectedOpen.map((id) => `rent_debt:${id}`));
  assert.deepEqual(reminders.filter((item) => item.type === "rent_debt").map((item) => item.paymentId), expectedOpen);
  return { report, display, reminders };
}

test("regression: an unhandled 2026-08-05 coverage is an open debt everywhere", () => {
  const target = tenant();
  const overdue = payment(target.id, "payment-aug-05", "2026-08-05", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const { report, display, reminders } = assertChain(target, [overdue], overdue.id, [overdue.id]);
  assert.equal(display.stateKind, "current_overdue");
  assert.equal(display.displayStatus, "欠租");
  assert.equal(report.entries[0]?.reason, "open-overdue");
  assert.equal(reminders[0]?.rentContext?.coverageEnd, "2026-08-05");
});

test("regression: two different 2026-08-10 tenants keep independent debt reminders and navigation", () => {
  const first = tenant("tenant-a", "Test");
  const second = tenant("tenant-b", "欠费1");
  const paymentA = payment(first.id, "payment-aug-10-a", "2026-08-10", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const paymentB = payment(second.id, "payment-aug-10-b", "2026-08-10", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const reminders = buildEffectiveReminders(snapshot([first, second], [paymentA, paymentB]));
  assert.deepEqual(reminders.filter((item) => item.type === "rent_debt").map((item) => item.id).sort(), ["rent_debt:payment-aug-10-a", "rent_debt:payment-aug-10-b"]);
  assert.deepEqual(reminders.filter((item) => item.type === "rent_debt").map((item) => item.navigationTarget.tenantId).sort(), [first.id, second.id]);
});

test("latest coverage and historical open debt remain distinct and visible", () => {
  const target = tenant("tenant-history", "Test");
  const oldDebt = payment(target.id, "payment-old", "2026-08-05");
  const current = payment(target.id, "payment-current", "2026-08-12", { amountPaid: 100, amountUnpaid: 0, paymentStatus: "已收" });
  const { display, reminders } = assertChain(target, [oldDebt, current], current.id, [oldDebt.id]);
  assert.equal(display.stateKind, "historical_debt");
  assert.equal(display.expiry.label, "即将到期1天");
  assert.equal(display.historicalDebtLabel, "历史欠费");
  assert.equal(reminders[0]?.paymentId, oldDebt.id);
});

test("coverage end is inclusive: today is not overdue and yesterday is overdue", () => {
  const target = tenant("tenant-boundary", "边界");
  const todayPayment = payment(target.id, "payment-today", TODAY);
  const yesterdayPayment = payment(target.id, "payment-yesterday", "2026-08-10");
  assertChain(target, [todayPayment], todayPayment.id, []);
  assertChain(target, [yesterdayPayment], yesterdayPayment.id, [yesterdayPayment.id]);
});

test("reconciliation records waiver, void, settled, invalid, and non-rent exclusion reasons", () => {
  const target = tenant("tenant-reasons", "核账");
  const waived = payment(target.id, "payment-waived", "2026-08-05");
  const voided = payment(target.id, "payment-void", "2026-08-04", { paymentStatus: "已作废" });
  const settled = payment(target.id, "payment-settled", "2026-08-03", { amountPaid: 100, amountUnpaid: 0, paymentStatus: "已收" });
  const invalid = payment(target.id, "payment-invalid", "not-a-date");
  const deposit = payment(target.id, "payment-deposit", "2026-08-02", { incomeType: "押金收入" });
  const report = inspectTenantRentState({ tenant: target, payments: [waived, voided, settled, invalid, deposit], waivedPaymentIds: new Set([waived.id]), today: TODAY });
  assert.deepEqual(Object.fromEntries(report.entries.map((entry) => [entry.paymentId, entry.reason])), {
    "payment-waived": "closed-waived", "payment-void": "closed-void", "payment-settled": "closed-settled", "payment-invalid": "excluded-invalid-coverage", "payment-deposit": "excluded-non-rent-income"
  });
});

test("golden rent-state matrix reconciles latest, open debt, tenant state and reminder IDs", () => {
  const cases: Array<{
    id: string; status?: string; payments: (target: BusinessTenant) => BusinessRentPayment[]; waived?: string[];
    latest: string | null; open: string[]; display: string; reminderIds?: string[];
  }> = [
    { id: "01-active", payments: (t) => [payment(t.id, "p01", "2026-08-31", { amountPaid: 100, amountUnpaid: 0, paymentStatus: "已收" })], latest: "p01", open: [], display: "normal" },
    { id: "02-end-today", payments: (t) => [payment(t.id, "p02", TODAY)], latest: "p02", open: [], display: "upcoming" },
    { id: "03-end-yesterday", payments: (t) => [payment(t.id, "p03", "2026-08-10")], latest: "p03", open: ["p03"], display: "current_overdue" },
    { id: "04-seven-days-overdue", payments: (t) => [payment(t.id, "p04", "2026-08-04")], latest: "p04", open: ["p04"], display: "current_overdue" },
    { id: "05-positive-debt", payments: (t) => [payment(t.id, "p05", "2026-08-05")], latest: "p05", open: ["p05"], display: "current_overdue" },
    { id: "06-zero-debt", payments: (t) => [payment(t.id, "p06", "2026-08-05", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 })], latest: "p06", open: ["p06"], display: "current_overdue" },
    { id: "07-waiver", payments: (t) => [payment(t.id, "p07", "2026-08-05")], waived: ["p07"], latest: "p07", open: [], display: "normal" },
    { id: "08-void", payments: (t) => [payment(t.id, "p08", "2026-08-05", { paymentStatus: "已作废" })], latest: null, open: [], display: "no_period" },
    { id: "09-settled", payments: (t) => [payment(t.id, "p09", "2026-08-05", { amountPaid: 100, amountUnpaid: 0, paymentStatus: "已收" })], latest: "p09", open: [], display: "normal" },
    { id: "10-current-plus-historical-positive", payments: (t) => [payment(t.id, "p10-old", "2026-08-05"), payment(t.id, "p10-current", "2026-08-20", { amountPaid: 100, amountUnpaid: 0 })], latest: "p10-current", open: ["p10-old"], display: "historical_debt" },
    { id: "11-current-plus-historical-zero", payments: (t) => [payment(t.id, "p11-old", "2026-08-05", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 }), payment(t.id, "p11-current", "2026-08-20", { amountPaid: 100, amountUnpaid: 0 })], latest: "p11-current", open: ["p11-old"], display: "historical_debt" },
    { id: "12-historical-waived", payments: (t) => [payment(t.id, "p12-old", "2026-08-05"), payment(t.id, "p12-current", "2026-08-20", { amountPaid: 100, amountUnpaid: 0 })], waived: ["p12-old"], latest: "p12-current", open: [], display: "upcoming" },
    { id: "13-multiple-open-debts", payments: (t) => [payment(t.id, "p13-a", "2026-07-01", { coverageStartDate: "2026-06-01" }), payment(t.id, "p13-b", "2026-08-05"), payment(t.id, "p13-current", "2026-08-20", { amountPaid: 100, amountUnpaid: 0 })], latest: "p13-current", open: ["p13-a", "p13-b"], display: "historical_debt" },
    { id: "14-same-day-distinct-payment", payments: (t) => [payment(t.id, "p14", "2026-08-10", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 })], latest: "p14", open: ["p14"], display: "current_overdue" },
    { id: "15-relet-historical-tenant", status: "moved_out", payments: (t) => [payment(t.id, "p15", "2026-08-05")], latest: "p15", open: ["p15"], display: "historical_debt" },
    { id: "16-moved-room-history", payments: (t) => [payment(t.id, "p16", "2026-08-05")], latest: "p16", open: ["p16"], display: "current_overdue" },
    { id: "17-archived-debt", status: "archived", payments: (t) => [payment(t.id, "p17", "2026-08-05")], latest: "p17", open: ["p17"], display: "historical_debt", reminderIds: [] },
    { id: "18-restored-archive", payments: (t) => [payment(t.id, "p18", "2026-08-05")], latest: "p18", open: ["p18"], display: "current_overdue" },
    { id: "19-moved-out-open", status: "moved_out", payments: (t) => [payment(t.id, "p19", "2026-08-05")], latest: "p19", open: ["p19"], display: "historical_debt" },
    { id: "20-moved-out-archived", status: "archived", payments: (t) => [payment(t.id, "p20", "2026-08-05")], latest: "p20", open: ["p20"], display: "historical_debt", reminderIds: [] },
    { id: "21-cross-month", payments: (t) => [payment(t.id, "p21", "2026-07-31", { coverageStartDate: "2026-07-01" })], latest: "p21", open: ["p21"], display: "current_overdue" },
    { id: "22-cross-year", payments: (t) => [payment(t.id, "p22", "2025-12-31", { coverageStartDate: "2025-12-01" })], latest: "p22", open: ["p22"], display: "current_overdue" },
    { id: "23-leap-year", payments: (t) => [payment(t.id, "p23", "2024-02-29", { coverageStartDate: "2024-02-01" })], latest: "p23", open: ["p23"], display: "current_overdue" },
    { id: "24-payment-specific-waiver", payments: (t) => [payment(t.id, "p24-a", "2026-08-05"), payment(t.id, "p24-b", "2026-08-06")], waived: ["p24-a"], latest: "p24-b", open: ["p24-b"], display: "current_overdue" },
    { id: "25-void-old-new-open", payments: (t) => [payment(t.id, "p25-old", "2026-08-05", { paymentStatus: "已作废" }), payment(t.id, "p25-new", "2026-08-06")], latest: "p25-new", open: ["p25-new"], display: "current_overdue" },
    { id: "26-created-at-conflicts-with-coverage", payments: (t) => [payment(t.id, "p26-late-entry", "2026-08-05", { createdAt: "2026-08-10T00:00:00.000Z" }), payment(t.id, "p26-current-coverage", "2026-08-20", { createdAt: "2026-08-01T00:00:00.000Z", amountPaid: 100, amountUnpaid: 0 })], latest: "p26-current-coverage", open: ["p26-late-entry"], display: "historical_debt" },
    { id: "27-invalid-coverage", payments: (t) => [payment(t.id, "p27", "not-a-date")], latest: null, open: [], display: "no_period" },
    { id: "28-non-rent-income", payments: (t) => [payment(t.id, "p28", "2026-08-05", { incomeType: "押金收入" })], latest: null, open: [], display: "no_period" }
  ];
  assert.equal(cases.length, 28);
  for (const scenario of cases) {
    const target = tenant(`tenant-${scenario.id}`, scenario.id, scenario.status || "在租");
    const payments = scenario.payments(target);
    const waivedPaymentIds = new Set(scenario.waived || []);
    const report = inspectTenantRentState({ tenant: target, payments, waivedPaymentIds, today: TODAY });
    const display = getTenantRentDisplay({ tenant: target, payments, waivedPaymentIds, today: TODAY });
    const reminderIds = buildEffectiveReminders(snapshot([target], payments, waivedPaymentIds)).filter((item) => item.type === "rent_debt").map((item) => item.id);
    assert.equal(report.latestPeriod.paymentId, scenario.latest, scenario.id);
    assert.deepEqual(report.openDebtPeriods.map((state) => state.paymentId), scenario.open, scenario.id);
    assert.equal(display.stateKind, scenario.display, scenario.id);
    assert.deepEqual(reminderIds, scenario.reminderIds || scenario.open.map((id) => `rent_debt:${id}`), scenario.id);
  }
});

test("rent reminder display contract keeps full coverage end on a second line", () => {
  const target = tenant();
  const overdue = payment(target.id, "payment-display", "2026-08-05", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const reminder = buildEffectiveReminders(snapshot([target], [overdue]))[0]!;
  const display = buildRentReminderDisplay(reminder);
  assert.equal(display?.primaryLine, "欠费2 | 测试房源 | 02 房间");
  assert.equal(display?.secondaryLine, "覆盖至 2026-08-05 | 已逾期 6 天 | €0.00");
  assert.equal(display?.statusText, "已逾期 6 天 | €0.00");
  assert.equal(display?.lifecycleLabel, "在租");
  assert.equal(display?.debtKindLabel, "当前欠租");
  assert.deepEqual(display?.availableActions, ["waive"]);
});

test("rent reminder display keeps lifecycle and historical debt semantics for moved-out and current tenants", () => {
  const movedOut = tenant("tenant-moved-out", "Test", "moved_out");
  const debt = payment(movedOut.id, "payment-moved-out", "2026-08-05", { amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const movedOutReminder = buildEffectiveReminders(snapshot([movedOut], [debt]))[0]!;
  const movedOutDisplay = buildRentReminderDisplay(movedOutReminder);
  assert.equal(movedOutReminder.tenantLifecycle, "moved_out");
  assert.equal(movedOutReminder.debtKind, "historical");
  assert.equal(movedOutDisplay?.lifecycleLabel, "已退租");
  assert.equal(movedOutDisplay?.debtKindLabel, "历史欠费");
  assert.equal(movedOutDisplay?.secondaryLine.includes("覆盖至 2026-08-05"), true);

  const current = tenant("tenant-current-history", "Current");
  const oldDebt = payment(current.id, "payment-history", "2026-08-05");
  const upcoming = payment(current.id, "payment-upcoming", "2026-08-20", { amountPaid: 100, amountUnpaid: 0, paymentStatus: "已收" });
  const historicalReminder = buildEffectiveReminders(snapshot([current], [oldDebt, upcoming])).find((item) => item.id === "rent_debt:payment-history")!;
  assert.equal(historicalReminder.tenantLifecycle, "current");
  assert.equal(historicalReminder.debtKind, "historical");
  assert.equal(buildRentReminderDisplay(historicalReminder)?.debtKindLabel, "历史欠费");
});
