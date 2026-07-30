import assert from "node:assert/strict";
import test from "node:test";
import { isValidCalendarDate, localToday } from "../lib/actual-move-out-date";

test("actual move-out dates accept valid calendar dates and reject invalid dates", () => {
  assert.equal(isValidCalendarDate("2026-07-31"), true);
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2026-2-9"), false);
  assert.equal(isValidCalendarDate(""), false);
});

test("localToday uses a stable Europe/Madrid calendar format", () => {
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});
