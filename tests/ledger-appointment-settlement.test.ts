import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { isManualExpenseLedgerVisible, isManualIncomeLedgerVisible } from "../lib/manual-ledger-visibility.ts";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { settlementSharesForProperty } from "../lib/single-owner-settlement.ts";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { appointmentQueueGroup, selectHomepageAppointments, sortViewingAppointments } from "../lib/viewing-appointment-queue.ts";

test("manual ledger visibility hides only historical zero ledger rows", () => {
  assert.equal(isManualIncomeLedgerVisible({ incomeType: "其他收入", amountPaid: 0 } as never), false);
  assert.equal(isManualIncomeLedgerVisible({ incomeType: "其他收入", amountPaid: 88.88 } as never), true);
  assert.equal(isManualIncomeLedgerVisible({ incomeType: "房租收入", amountPaid: 0, amountDue: 500 } as never), true);
  assert.equal(isManualExpenseLedgerVisible({ amount: 0 } as never), false);
  assert.equal(isManualExpenseLedgerVisible({ amount: 88.88 } as never), true);
});

test("single owner settlement gets a 100 percent in-memory fallback without changing stored shares", () => {
  const shares: never[] = [];
  const fallback = settlementSharesForProperty("p1", "2026-08-01", shares, [{ id: "owner", workspaceOwnerId: "w" }], true);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].partnerId, "owner");
  assert.equal(fallback[0].percentage, 100);
  assert.deepEqual(shares, []);
  assert.equal(settlementSharesForProperty("p1", "2026-08-01", shares, [{ id: "a", workspaceOwnerId: "w" }, { id: "b", workspaceOwnerId: "w" }], true).length, 0);
});

test("appointment queue prioritizes future pending, then past pending, then history", () => {
  const today = "2026-08-23";
  const items = [
    { id: "history", appointmentDate: "2026-08-20", appointmentTime: "09:00", status: "已看房" },
    { id: "future-late", appointmentDate: "2026-08-27", appointmentTime: "09:00", status: "待看房" },
    { id: "past", appointmentDate: "2026-08-22", appointmentTime: "18:00", status: "待看房" },
    { id: "future-near", appointmentDate: "2026-08-23", appointmentTime: "10:00", status: "待看房" },
    { id: "cancelled", appointmentDate: "2026-08-21", appointmentTime: "10:00", status: "已取消" }
  ];
  assert.equal(appointmentQueueGroup(items[3], today), 0);
  assert.equal(appointmentQueueGroup(items[2], today), 1);
  assert.equal(appointmentQueueGroup(items[0], today), 2);
  assert.deepEqual(sortViewingAppointments(items, today).map((item) => item.id), ["future-near", "future-late", "past", "history", "cancelled"]);
  assert.deepEqual(selectHomepageAppointments(items, today, 3).map((item) => item.id), ["future-near", "future-late", "past"]);
});

test("page owners keep scoped ledger, settlement, appointment and cache contracts", () => {
  const payments = readFileSync("app/rent-payments/page.tsx", "utf8");
  const expenses = readFileSync("app/expenses/page.tsx", "utf8");
  const settlement = readFileSync("app/partnership-settlement/page.tsx", "utf8");
  const appointments = readFileSync("app/viewing-appointments/page.tsx", "utf8");
  const businessData = readFileSync("lib/business-data.ts", "utf8");
  assert.match(payments, /isManualIncomeLedgerVisible\(payment\)/);
  assert.match(expenses, /isManualExpenseLedgerVisible\(expense\)/);
  assert.match(settlement, /access\.isFreeSingle/);
  assert.match(settlement, /确认结算/);
  assert.match(appointments, /QuickStatusMenu/);
  assert.match(appointments, /updateStatus/);
  assert.match(businessData, /viewingAppointmentKey\]: \[viewingAppointmentKey, "home-summary", "dashboard-v3"\]/);
});
