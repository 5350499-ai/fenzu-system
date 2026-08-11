import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessContract, BusinessDeposit, BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { buildEffectiveReminders, summarizeEffectiveReminders } from "../lib/reminder-engine.ts";

const TODAY = "2026-08-11";
const property = { id: "property-1", name: "一号房源", address: "", city: "" } as BusinessProperty;
const room = { id: "room-1", propertyId: property.id, name: "101 房", roomNumber: "101", monthlyRent: 500, depositAmount: 500, status: "已租" } as BusinessRoom;
const tenant = (status = "在租") => ({ id: "tenant-1", propertyId: property.id, roomId: room.id, name: "租客甲", monthlyRent: 500, depositAmount: 500, status } as BusinessTenant);
const payment = (overrides: Partial<BusinessRentPayment> = {}) => ({
  id: "payment-1", propertyId: property.id, roomId: room.id, tenantId: "tenant-1", incomeType: "房租收入", paymentStatus: "未收",
  amountDue: 500, amountPaid: 0, amountUnpaid: 500, coverageStartDate: "2026-07-01", coverageEndDate: "2026-08-01", paymentMethod: "转账", isOverdue: true, ...overrides
} as BusinessRentPayment);

function snapshot(overrides: Partial<Parameters<typeof buildEffectiveReminders>[0]> = {}) {
  return {
    properties: [property], rooms: [room], tenants: [tenant()], contracts: [], rentPayments: [payment()], deposits: [], waivedPaymentIds: new Set<string>(), includeBackupReminder: false, today: TODAY,
    ...overrides
  };
}

test("Reminder Engine creates a stable tenant-owned overdue debt reminder with shared actions", () => {
  const [item] = buildEffectiveReminders(snapshot()).filter((entry) => entry.type === "rent_debt");
  assert.equal(item.id, "rent_debt:payment-1");
  assert.equal(item.tenantId, "tenant-1");
  assert.equal(item.navigationTarget.kind, "tenant");
  assert.equal(item.navigationTarget.href, "/tenants?tenantId=tenant-1&paymentId=payment-1&focus=debt");
  assert.deepEqual(item.availableActions, ["collect", "waive"]);
  assert.equal(item.debtCase?.tenantLifecycle, "current");
  assert.equal(item.debtCase?.debtKind, "current");
  assert.deepEqual(item.surfaces, ["dashboard", "reminder_center"]);
});

test("Reminder Engine applies archive, move-out, waiver and zero-period policy without changing debt facts", () => {
  const open = payment();
  assert.equal(buildEffectiveReminders(snapshot()).some((entry) => entry.id === "rent_debt:payment-1"), true);
  assert.equal(buildEffectiveReminders(snapshot({ tenants: [tenant("已归档")] })).some((entry) => entry.type === "rent_debt"), false);
  assert.equal(buildEffectiveReminders(snapshot({ tenants: [tenant("已退租")] })).some((entry) => entry.type === "rent_debt"), true);
  assert.equal(buildEffectiveReminders(snapshot({ waivedPaymentIds: new Set([open.id]) })).some((entry) => entry.type === "rent_debt"), false);
  const zero = payment({ id: "payment-zero", amountDue: 0, amountPaid: 0, amountUnpaid: 0 });
  const zeroItem = buildEffectiveReminders(snapshot({ rentPayments: [zero] })).find((entry) => entry.id === "rent_debt:payment-zero");
  assert.deepEqual(zeroItem?.availableActions, ["waive"]);
  assert.equal(buildEffectiveReminders(snapshot({ rentPayments: [zero], waivedPaymentIds: new Set([zero.id]) })).some((entry) => entry.id === "rent_debt:payment-zero"), false);
});

test("payment-specific waiver never suppresses a different rent period", () => {
  const first = payment({ id: "payment-a", coverageEndDate: "2026-06-30", createdAt: "2026-06-01T00:00:00.000Z" });
  const second = payment({ id: "payment-b", coverageEndDate: "2026-08-01", createdAt: "2026-08-01T00:00:00.000Z" });
  const reminders = buildEffectiveReminders(snapshot({ rentPayments: [first, second], waivedPaymentIds: new Set([first.id]) }));
  assert.equal(reminders.some((entry) => entry.id === "rent_debt:payment-b"), true);
});

test("future collection reminders exclude moved-out and archived tenants", () => {
  const upcoming = payment({ coverageEndDate: "2026-08-15" });
  assert.equal(buildEffectiveReminders(snapshot({ rentPayments: [upcoming] })).some((entry) => entry.type === "rent_collection"), true);
  assert.equal(buildEffectiveReminders(snapshot({ tenants: [tenant("已退租")], rentPayments: [upcoming] })).some((entry) => entry.type === "rent_collection"), false);
  assert.equal(buildEffectiveReminders(snapshot({ tenants: [tenant("已归档")], rentPayments: [upcoming] })).some((entry) => entry.type === "rent_collection"), false);
});

test("moved-out open debt keeps tenant lifecycle and historical debt metadata", () => {
  const item = buildEffectiveReminders(snapshot({ tenants: [tenant("moved_out")] })).find((entry) => entry.type === "rent_debt");
  assert.equal(item?.debtCase?.tenantLifecycle, "moved_out");
  assert.equal(item?.debtCase?.debtKind, "historical");
  assert.equal(item?.navigationTarget.tenantId, "tenant-1");
});

test("contract, deposit, moving-out, vacant and backup reminders share stable entity IDs", () => {
  const movingRoom = { ...room, id: "room-moving", status: "即将退租" };
  const vacantRoom = { ...room, id: "room-vacant", status: "空置" };
  const endedContract = { id: "contract-ended", tenantId: tenant().id, propertyId: property.id, roomId: room.id, endDate: "2026-08-20", status: "已结束" } as BusinessContract;
  const activeContract = { ...endedContract, id: "contract-open", status: "有效" };
  const voidContract = { ...endedContract, id: "contract-void", status: "已作废" };
  const deposit = { id: "deposit-1", tenantId: tenant("已退租").id, propertyId: property.id, roomId: room.id, amount: 500, status: "待退", notes: "" } as BusinessDeposit;
  const items = buildEffectiveReminders(snapshot({
    rooms: [room, movingRoom, vacantRoom], tenants: [tenant("已退租")], contracts: [endedContract, activeContract, voidContract], deposits: [deposit], rentPayments: [],
    includeBackupReminder: true, backupReminderSettings: { frequency: "monthly", firstEnabledAt: "2026-06-01T00:00:00.000Z", lastSuccessfulBackupAt: "" }
  }));
  assert.equal(items.some((entry) => entry.id === "contract-expiry:contract-open"), true);
  assert.equal(items.some((entry) => entry.id === "contract-expiry:contract-ended"), false);
  assert.equal(items.some((entry) => entry.id === "contract-expiry:contract-void"), false);
  assert.equal(items.some((entry) => entry.id === "deposit-return:deposit-1"), true);
  assert.equal(items.some((entry) => entry.id === "moving-out-room:room-moving"), true);
  assert.equal(items.some((entry) => entry.id === "vacant-room:room-vacant"), true);
  assert.equal(items.some((entry) => entry.id === "backup:scheduled"), true);
});

test("summary, sorting and deduplication are collection-level and surface-independent", () => {
  const items = buildEffectiveReminders(snapshot({ rooms: [{ ...room, id: "room-2", status: "空置" }, { ...room, id: "room-3", status: "空置" }] }));
  const summary = summarizeEffectiveReminders(items);
  assert.equal(summary.total, items.length);
  assert.equal(summary.debtCount, 1);
  assert.equal(summary.vacantRoomCount, 2);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(items[0]?.type, "rent_debt");
  assert.equal(items.filter((item) => item.surfaces.includes("dashboard")).length, items.filter((item) => item.surfaces.includes("reminder_center")).length);
});
