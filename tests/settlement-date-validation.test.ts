import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner needs the explicit source extension.
import { getMaxSettlementEndDate, getRollingThreeMonthSettlementRange, getSettlementDateValidationError, getSettlementBusinessToday, isValidSettlementRange, validDate } from "../lib/settlement-date.ts";

const api = readFileSync("app/api/partner-settlements/route.ts", "utf8");
const page = readFileSync("app/partnership-settlement/page.tsx", "utf8");
const rpcMigration = readFileSync("supabase/migrations/20260823200000_settlement_europe_madrid_max_end_date.sql", "utf8");

test("settlement API uses the canonical shared date-range validator", () => {
  assert.match(api, /getSettlementDateValidationError\(startDate, endDate\)/);
  assert.match(api, /结算结束日期不能晚于昨天/);
  assert.doesNotMatch(api, /\/\^\\\\d\{4\}/);
});

test("settlement boundary uses Europe/Madrid business yesterday", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  assert.equal(getSettlementBusinessToday(now), "2026-08-23");
  assert.equal(getMaxSettlementEndDate(now), "2026-08-22");
  assert.equal(getSettlementDateValidationError("2026-06-01", "2026-08-22", now), null);
  assert.equal(getSettlementDateValidationError("2026-08-22", "2026-08-22", now), null);
  assert.equal(getSettlementDateValidationError("2026-06-01", "2026-08-23", now), "future_end");
  assert.equal(getSettlementDateValidationError("2026-06-01", "2026-08-24", now), "future_end");
  assert.equal(isValidSettlementRange("2026-06-01", "2026-08-23", now), false);
});

test("settlement UI applies the same max-end boundary to custom and three-month ranges", () => {
  assert.match(page, /maxSettlementEndDate/);
  assert.match(page, /max=\{maxSettlementEndDate\}/);
  assert.match(page, /getRollingThreeMonthSettlementRange\(today\)/);
  assert.match(page, /getSettlementDateValidationError\(activeRange\.startDate, activeRange\.endDate\)/);
});

test("settlement RPC defense uses explicit Europe/Madrid yesterday guard for both overloads", () => {
  assert.equal((rpcMigration.match(/timezone\('Europe\/Madrid', now\(\)\)::date - 1/g) || []).length, 2);
  assert.equal((rpcMigration.match(/create or replace function public\.confirm_partner_settlement/g) || []).length, 2);
  assert.match(rpcMigration, /grant execute on function public\.confirm_partner_settlement/);
  assert.doesNotMatch(rpcMigration, /grant execute on function public\.confirm_partner_settlement[^;]*authenticated/i);
  assert.doesNotMatch(rpcMigration, /\b(delete from|update public\.partner_settlement_batches)\b/i);
});

test("settlement date validation accepts valid inclusive YYYY-MM-DD ranges", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  assert.equal(validDate("2026-06-01"), true);
  assert.equal(validDate("2026-08-23"), true);
  assert.equal(validDate("2026-12-31"), true);
  assert.equal(isValidSettlementRange("2026-06-01", "2026-08-22", now), true);
  assert.equal(isValidSettlementRange("2026-08-22", "2026-08-22", now), true);
});

test("settlement date validation rejects malformed and reversed ranges", () => {
  assert.equal(isValidSettlementRange("2026-08-23", "2026-06-01"), false);
  assert.equal(isValidSettlementRange("2026/06/01", "2026-08-23"), false);
  assert.equal(isValidSettlementRange("2026-6-1", "2026-08-23"), false);
  assert.equal(isValidSettlementRange("", "2026-08-23"), false);
  assert.equal(isValidSettlementRange(undefined, "2026-08-23"), false);
});

test("rolling three-month preset uses calendar-month arithmetic from business yesterday", () => {
  assert.deepEqual(getRollingThreeMonthSettlementRange(new Date("2026-08-23T10:00:00.000Z")), { startDate: "2026-05-23", endDate: "2026-08-22" });
  assert.deepEqual(getRollingThreeMonthSettlementRange(new Date("2026-06-01T10:00:00.000Z")), { startDate: "2026-03-01", endDate: "2026-05-31" });
  assert.deepEqual(getRollingThreeMonthSettlementRange(new Date("2024-03-01T10:00:00.000Z")), { startDate: "2023-11-30", endDate: "2024-02-29" });
});

test("authorization repair remains in the same confirmation pipeline", () => {
  assert.match(api, /requireSettlementConfirmationAccess\(context\)/);
  assert.doesNotMatch(api, /requireActiveAccount\(request, true\)/);
});
