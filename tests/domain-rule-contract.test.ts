import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const contract = readFileSync("DOMAIN_RULE_CONTRACT.md", "utf8");
const profit = readFileSync("lib/profit.ts", "utf8");
const settlement = readFileSync("lib/partner-settlement.ts", "utf8");
const rentPeriod = readFileSync("lib/rent-period-state.ts", "utf8");
const debtCase = readFileSync("lib/debt-case.ts", "utf8");
const reminderEngine = readFileSync("lib/reminder-engine.ts", "utf8");

const ruleIds = [
  "PROPERTY", "ROOM", "TENANT", "CONTRACT", "CHECK_IN", "MOVE_ROOM", "MOVE_OUT",
  "RENT_PAYMENT", "RENT_PERIOD", "DEBT", "DEBT_CASE", "DEBT_WAIVER", "DEPOSIT",
  "EXPENSE", "REMINDER", "VIEWING_APPOINTMENT", "PARTNER", "PARTNER_SHARE",
  "SETTLEMENT", "SETTLEMENT_REVERSAL", "DASHBOARD_METRICS", "PROPERTY_METRICS",
  "OCCUPANCY", "INCOME_EXPENSE_PROFIT", "ATTACHMENT_OWNERSHIP",
  "BACKUP_RESTORE_MAPPING", "ACCOUNT_PERMISSION_SCOPE"
];

test("domain registry is complete and has one explicit final status", () => {
  assert.match(contract, /# Domain Rule Contract/);
  for (const id of ruleIds) assert.match(contract, new RegExp(`RULE\\.${id}`), id);
  assert.match(contract, /DOMAIN_RULE_5X_COMPLETE_WITH_DEFERRED_RISKS/);
  assert.match(contract, /No P0 was found/);
});

test("canonical rent, debt and reminder owners remain shared", () => {
  assert.match(rentPeriod, /export function inspectTenantRentState/);
  assert.match(debtCase, /export function getDebtCases/);
  assert.match(reminderEngine, /export function buildEffectiveReminders/);
  assert.match(contract, /Pages must not build\s+another debt, coverage or waiver selector/);
});

test("identical settlement accounting helpers use the profit owner", () => {
  assert.match(profit, /export function rentIncomeForPayment/);
  assert.match(profit, /export function paymentAccountingDate/);
  assert.match(settlement, /import \{ paymentAccountingDate, rentIncomeForPayment \} from "\.\/profit"/);
  assert.doesNotMatch(settlement, /function rentIncomeForPayment/);
  assert.doesNotMatch(settlement, /function paymentAccountingDate/);
});

test("amount, date, snapshot and compatibility boundaries are explicit", () => {
  for (const marker of [
    "amountPaid",
    "rentMonth",
    "Europe/Madrid",
    "Current facts, snapshots and compatibility data remain distinct",
    "DOMAIN.DATE.UTC_PAGE_DEFAULTS",
    "DATA_INTEGRITY_REVIEW_REQUIRED"
  ]) assert.ok(contract.includes(marker), marker);
  assert.ok(contract.includes("`business-*` canonical resources"));
});

test("frozen action and responsive ownership remains protected", () => {
  assert.match(contract, /No new domain change may modify schema, RPC semantics/);
  assert.match(contract, /RentPeriodState`, `DebtCase` and `Reminder Engine` remain unique/);
  assert.match(contract, /Account\/property scope is required/);
});
