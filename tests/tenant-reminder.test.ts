import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { tenantReminderHref } from "../lib/reminder-navigation.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { fixedTenantRentDebtReminderStage, hasUnresolvedTenantRentDebt, shouldShowTenantRentReminder } from "../lib/rent-coverage.ts";

const baseTenant = { id: "tenant-1", status: "在租", propertyId: "property-1", roomId: "room-1" } as BusinessTenant;
const overduePayment = (amountPaid = 0) => ({
  id: "payment-1",
  tenantId: "tenant-1",
  amountDue: 500,
  amountPaid,
  amountUnpaid: 500 - amountPaid,
  incomeType: "房租收入",
  coverageEndDate: "2026-08-01",
  paymentStatus: amountPaid ? "已收" : "未收",
  notes: ""
} as BusinessRentPayment);

test("tenant-subject reminders navigate by tenant ID, not room ID", () => {
  assert.equal(tenantReminderHref("tenant/1"), "/tenants?tenantId=tenant%2F1");
  assert.equal(tenantReminderHref(null), "/tenants");
});

test("unresolved debt remains a reminder after tenant archive", () => {
  const payment = overduePayment();
  const archived = { ...baseTenant, status: "已归档" };
  assert.equal(hasUnresolvedTenantRentDebt(baseTenant, payment, "2026-08-11"), true);
  assert.equal(hasUnresolvedTenantRentDebt(archived, payment, "2026-08-11"), true);
  assert.equal(fixedTenantRentDebtReminderStage(archived, payment, "2026-08-11")?.level, "overdue");
});

test("paid archived debt is not reminder eligible", () => {
  const archived = { ...baseTenant, status: "已归档" };
  const paid = overduePayment(500);
  assert.equal(hasUnresolvedTenantRentDebt(archived, paid, "2026-08-11"), false);
  assert.equal(fixedTenantRentDebtReminderStage(archived, paid, "2026-08-11"), null);
});

test("an explicit collection waiver removes only that debt reminder", () => {
  const archived = { ...baseTenant, status: "已归档" };
  const payment = overduePayment();
  assert.equal(shouldShowTenantRentReminder(archived, payment, new Set()), true);
  assert.equal(shouldShowTenantRentReminder(archived, payment, new Set([payment.id])), false);
});

test("archive state does not create a reminder for a non-overdue future coverage", () => {
  const archived = { ...baseTenant, status: "已归档" };
  const future = { ...overduePayment(), coverageEndDate: "2026-08-31" };
  assert.equal(fixedTenantRentDebtReminderStage(archived, future, "2026-08-11"), null);
});
