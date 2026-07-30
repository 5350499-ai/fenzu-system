import assert from "node:assert/strict";
import test from "node:test";
import { calendarCutoffDate, evaluateCandidate, isCalendarDate, isContractCurrentlyActive, isTenantCandidateAttachmentTable } from "../lib/attachment-management-rules";

const today = new Date("2026-07-30T12:00:00Z");

test("natural-month thresholds include exactly three and six months", () => {
  assert.equal(calendarCutoffDate(today, 3), "2026-04-30");
  assert.equal(calendarCutoffDate(today, 6), "2026-01-30");
  assert.deepEqual(evaluateCandidate({ status: "已退租", actualMoveOutDate: "2026-04-30", hasActiveContract: false }, "2026-04-30"), { eligible: true });
  assert.deepEqual(evaluateCandidate({ status: "已退租", actualMoveOutDate: "2026-01-30", hasActiveContract: false }, "2026-01-30"), { eligible: true });
  assert.deepEqual(evaluateCandidate({ status: "已退租", actualMoveOutDate: "2026-05-01", hasActiveContract: false }, "2026-04-30"), { eligible: false, reason: "not_old_enough" });
});

test("missing, invalid, active, and non-moved-out tenants are skipped", () => {
  assert.deepEqual(evaluateCandidate({ status: "已退租", actualMoveOutDate: null, hasActiveContract: false }, "2026-04-30"), { eligible: false, reason: "missing_move_out_date" });
  assert.deepEqual(evaluateCandidate({ status: "已退租", actualMoveOutDate: "2026-02-30", hasActiveContract: false }, "2026-04-30"), { eligible: false, reason: "invalid_move_out_date" });
  assert.deepEqual(evaluateCandidate({ status: "在租", actualMoveOutDate: "2026-01-01", hasActiveContract: false }, "2026-04-30"), { eligible: false, reason: "not_moved_out" });
  assert.deepEqual(evaluateCandidate({ status: "待入住", actualMoveOutDate: "2026-01-01", hasActiveContract: false }, "2026-04-30"), { eligible: false, reason: "not_moved_out" });
  assert.deepEqual(evaluateCandidate({ status: "已退租", actualMoveOutDate: "2026-01-01", hasActiveContract: true }, "2026-04-30"), { eligible: false, reason: "active_contract" });
});

test("active contract uses status, active flag, and end-date rules", () => {
  assert.equal(isContractCurrentlyActive({ status: "有效", isActive: true, endDate: null }, "2026-07-30"), true);
  assert.equal(isContractCurrentlyActive({ status: "有效", isActive: true, endDate: "2026-07-30" }, "2026-07-30"), true);
  assert.equal(isContractCurrentlyActive({ status: "有效", isActive: true, endDate: "2026-07-29" }, "2026-07-30"), false);
  assert.equal(isContractCurrentlyActive({ status: "已结束", isActive: true, endDate: "2027-01-01" }, "2026-07-30"), false);
  assert.equal(isContractCurrentlyActive({ status: "有效", isActive: false, endDate: "2027-01-01" }, "2026-07-30"), false);
});

test("calendar date is stable across UTC day boundaries", () => {
  assert.equal(calendarCutoffDate(new Date("2026-07-31T23:30:00Z"), 3), "2026-05-01");
  assert.equal(calendarCutoffDate(new Date("2026-07-30T22:30:00Z"), 3), "2026-04-30");
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("bad-date"), false);
});

test("only contract and rent-payment files can be candidates", () => {
  assert.equal(isTenantCandidateAttachmentTable("contract_files"), true);
  assert.equal(isTenantCandidateAttachmentTable("rent_payment_files"), true);
  assert.equal(isTenantCandidateAttachmentTable("expense_files"), false);
});
