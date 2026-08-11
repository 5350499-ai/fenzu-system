import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRentPayment, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { tenantReminderHref } from "../lib/reminder-navigation.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { fixedTenantRentDebtReminderStage, hasUnresolvedTenantRentDebt, isWaivableRentCollectionEvent, shouldShowTenantRentReminder } from "../lib/rent-coverage.ts";

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

test("archive mutes reminder presentation without settling unresolved debt", () => {
  const payment = overduePayment();
  const archived = { ...baseTenant, status: "已归档" };
  assert.equal(hasUnresolvedTenantRentDebt(baseTenant, payment, "2026-08-11"), true);
  assert.equal(hasUnresolvedTenantRentDebt(archived, payment, "2026-08-11"), true);
  assert.equal(fixedTenantRentDebtReminderStage(archived, payment, "2026-08-11"), null);
  assert.equal(shouldShowTenantRentReminder(archived, payment, new Set(), "2026-08-11"), false);
});

test("paid archived debt is not reminder eligible", () => {
  const archived = { ...baseTenant, status: "已归档" };
  const paid = overduePayment(500);
  assert.equal(hasUnresolvedTenantRentDebt(archived, paid, "2026-08-11"), false);
  assert.equal(fixedTenantRentDebtReminderStage(archived, paid, "2026-08-11"), null);
});

test("an explicit collection waiver removes only that debt reminder", () => {
  const payment = overduePayment();
  assert.equal(shouldShowTenantRentReminder(baseTenant, payment, new Set(), "2026-08-11"), true);
  assert.equal(shouldShowTenantRentReminder(baseTenant, payment, new Set([payment.id]), "2026-08-11"), false);
});

test("a valid zero-balance overdue rent event can be waived without changing amounts", () => {
  const zeroBalance = { ...overduePayment(0), amountDue: 0, amountPaid: 0, amountUnpaid: 0 };
  assert.equal(isWaivableRentCollectionEvent(zeroBalance, "2026-08-11"), true);
  assert.equal(shouldShowTenantRentReminder(baseTenant, zeroBalance, new Set(), "2026-08-11"), true);
  assert.equal(shouldShowTenantRentReminder(baseTenant, zeroBalance, new Set([zeroBalance.id]), "2026-08-11"), false);
  assert.equal(zeroBalance.amountDue, 0);
  assert.equal(zeroBalance.amountPaid, 0);
  assert.equal(zeroBalance.amountUnpaid, 0);
});

test("moved-out tenants remain reminder-visible until an archive or handling action", () => {
  const movedOut = { ...baseTenant, status: "已退租" };
  const payment = overduePayment();
  assert.equal(hasUnresolvedTenantRentDebt(movedOut, payment, "2026-08-11"), true);
  assert.equal(fixedTenantRentDebtReminderStage(movedOut, payment, "2026-08-11")?.level, "overdue");
  assert.equal(shouldShowTenantRentReminder(movedOut, payment, new Set(), "2026-08-11"), true);
});

test("restoring archive re-enables the same unresolved debt reminder", () => {
  const archived = { ...baseTenant, status: "已归档" };
  const payment = overduePayment();
  assert.equal(shouldShowTenantRentReminder(archived, payment, new Set(), "2026-08-11"), false);
  assert.equal(shouldShowTenantRentReminder(baseTenant, payment, new Set(), "2026-08-11"), true);
});

test("current tenants retain upcoming collection reminders while overdue paid periods do not", () => {
  const upcoming = { ...overduePayment(), coverageEndDate: "2026-08-15" };
  const settledOverdue = overduePayment(500);
  assert.equal(fixedTenantRentDebtReminderStage(baseTenant, upcoming, "2026-08-11")?.level, "upcoming");
  assert.equal(shouldShowTenantRentReminder(baseTenant, upcoming, new Set(), "2026-08-11"), true);
  assert.equal(fixedTenantRentDebtReminderStage(baseTenant, settledOverdue, "2026-08-11"), null);
  assert.equal(shouldShowTenantRentReminder(baseTenant, settledOverdue, new Set(), "2026-08-11"), false);
});

test("positive overdue rent events remain waiver eligible", () => {
  assert.equal(isWaivableRentCollectionEvent(overduePayment(0), "2026-08-11"), true);
  assert.equal(isWaivableRentCollectionEvent(overduePayment(490), "2026-08-11"), true);
});

test("archive state does not create a reminder for a non-overdue future coverage", () => {
  const archived = { ...baseTenant, status: "已归档" };
  const future = { ...overduePayment(), coverageEndDate: "2026-08-31" };
  assert.equal(fixedTenantRentDebtReminderStage(archived, future, "2026-08-11"), null);
});
