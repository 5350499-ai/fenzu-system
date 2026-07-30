import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessContract, BusinessRoom, BusinessTenant, BusinessRentPayment } from "../lib/business-data";
import { isRentReminderTenant, rentCoverageReminderStageFixed } from "../lib/rent-coverage";

const tenant = { id: "tenant-1", roomId: "room-1", status: "\u5728\u79df" } as BusinessTenant;
const room = { id: "room-1", status: "\u5df2\u51fa\u79df" } as BusinessRoom;
const payment = (end: string) => ({ coverageEndDate: end } as BusinessRentPayment);

test("fixed rent reminders use a ten-day window and required tones", () => {
  assert.equal(rentCoverageReminderStageFixed(payment("2026-07-12"), "2026-07-01"), null);
  assert.equal(rentCoverageReminderStageFixed(payment("2026-07-11"), "2026-07-01")?.level, "upcoming");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-07-05"), "2026-07-01")?.level, "upcoming");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-07-04"), "2026-07-01")?.level, "urgent");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-07-02"), "2026-07-01")?.level, "urgent");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-07-01"), "2026-07-01")?.level, "critical");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-06-30"), "2026-07-01")?.level, "overdue");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-05-02"), "2026-07-01")?.level, "overdue");
  assert.equal(rentCoverageReminderStageFixed(payment("2026-03-23"), "2026-07-01")?.level, "overdue");
});

test("vacant rooms and ended tenants are excluded from rent reminders", () => {
  assert.equal(isRentReminderTenant(tenant, [room]), true);
  assert.equal(isRentReminderTenant(tenant, [{ ...room, status: "\u7a7a\u7f6e" }]), false);
  assert.equal(isRentReminderTenant({ ...tenant, status: "\u5df2\u9000\u79df" }, [room]), false);
  const endedContract = { tenantId: tenant.id, status: "\u6709\u6548", endDate: "2026-06-30" } as BusinessContract;
  assert.equal(isRentReminderTenant(tenant, [room], [endedContract], "2026-07-01"), false);
});
