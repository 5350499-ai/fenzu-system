import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's strip-types test runner resolves the explicit source extension.
import { matchesFinanceSearch, normalizeFinanceAmount, normalizeFinanceSearchText } from "../lib/finance-search.ts";

test("PAYMENT_SEARCH_BY_PARTNER", () => assert.equal(matchesFinanceSearch("峰峰", ["A", "峰峰"]), true));
test("PAYMENT_SEARCH_BY_PROPERTY", () => assert.equal(matchesFinanceSearch("Rosers", ["Rosers property"]), true));
test("PAYMENT_SEARCH_BY_ROOM", () => assert.equal(matchesFinanceSearch("503", ["503 1.35床空调"]), true));
test("PAYMENT_SEARCH_BY_NOTE", () => assert.equal(matchesFinanceSearch("门锁", ["国内发货门锁，门禁等"]), true));
test("PAYMENT_SEARCH_BY_AMOUNT", () => assert.equal(matchesFinanceSearch("430,00", ["€430.00"]), true));
test("PAYMENT_SEARCH_BY_DATE", () => assert.equal(matchesFinanceSearch("2026-08", ["2026-08-22"]), true));
test("EXPENSE_SEARCH_BY_PARTNER", () => assert.equal(matchesFinanceSearch("峰峰", ["峰峰"]), true));
test("EXPENSE_SEARCH_BY_PROPERTY", () => assert.equal(matchesFinanceSearch("Benicalap", ["Benicalap 16"]), true));
test("EXPENSE_SEARCH_BY_ROOM", () => assert.equal(matchesFinanceSearch("501", ["501 0.9米床"]), true));
test("EXPENSE_SEARCH_BY_DESCRIPTION", () => assert.equal(matchesFinanceSearch("发货", ["国内发货门锁"]), true));
test("EXPENSE_SEARCH_BY_AMOUNT", () => assert.equal(matchesFinanceSearch("€1,224.52", [1224.52]), true));
test("EXPENSE_SEARCH_BY_DATE", () => assert.equal(matchesFinanceSearch("2026-08-22", ["2026-08-22"]), true));
test("LEGACY_PARTNER_CODE_SEARCH_BY_DISPLAY_NAME", () => assert.equal(matchesFinanceSearch("峰峰", ["A", "峰峰"]), true));
test("SEARCH_CLEAR_RESTORES_LIST", () => assert.equal(matchesFinanceSearch("", ["anything"]), true));
test("SEARCH_EMPTY_RESULT_STATE", () => assert.equal(matchesFinanceSearch("not-found", ["峰峰", "Benicalap"]), false));
test("SEARCH_DOES_NOT_CHANGE_TOTALS", () => assert.equal(normalizeFinanceAmount("€430,00"), "430.00"));
test("finance search normalization handles case and whitespace", () => assert.equal(normalizeFinanceSearchText("  FENG  FENG "), "feng feng"));
