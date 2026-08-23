import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidSettlementRange, validDate } from "../lib/settlement-date";

const api = readFileSync("app/api/partner-settlements/route.ts", "utf8");

test("settlement API uses the canonical shared date-range validator", () => {
  assert.match(api, /isValidSettlementRange\(startDate, endDate\)/);
  assert.doesNotMatch(api, /\/\^\\\\d\{4\}/);
});

test("settlement date validation accepts valid inclusive YYYY-MM-DD ranges", () => {
  assert.equal(validDate("2026-06-01"), true);
  assert.equal(validDate("2026-08-23"), true);
  assert.equal(validDate("2026-12-31"), true);
  assert.equal(isValidSettlementRange("2026-06-01", "2026-08-23"), true);
  assert.equal(isValidSettlementRange("2026-08-23", "2026-08-23"), true);
});

test("settlement date validation rejects malformed and reversed ranges", () => {
  assert.equal(isValidSettlementRange("2026-08-23", "2026-06-01"), false);
  assert.equal(isValidSettlementRange("2026/06/01", "2026-08-23"), false);
  assert.equal(isValidSettlementRange("2026-6-1", "2026-08-23"), false);
  assert.equal(isValidSettlementRange("", "2026-08-23"), false);
  assert.equal(isValidSettlementRange(undefined, "2026-08-23"), false);
});

test("authorization repair remains in the same confirmation pipeline", () => {
  assert.match(api, /requireSettlementConfirmationAccess\(context\)/);
  assert.doesNotMatch(api, /requireActiveAccount\(request, true\)/);
});
