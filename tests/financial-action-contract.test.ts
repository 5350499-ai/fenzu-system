import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync("ACTION_TREE_CONTRACT.md", "utf8");
const tenants = readFileSync("app/tenants/page.tsx", "utf8");
const rentPayments = readFileSync("app/rent-payments/page.tsx", "utf8");
const expenses = readFileSync("app/expenses/page.tsx", "utf8");
const deposits = readFileSync("app/tenants/page.tsx", "utf8");
const settlement = readFileSync("app/partnership-settlement/page.tsx", "utf8");
const reversal = readFileSync("app/partner-settlements/[id]/page.tsx", "utf8") + readFileSync("app/api/partner-settlements/[id]/route.ts", "utf8");

test("financial safety matrix covers all six 3.2a roots", () => {
  for (const id of [
    "ACTION.RENT_PAYMENT.SAVE",
    "ACTION.EXPENSE.SAVE",
    "ACTION.DEPOSIT.SAVE",
    "ACTION.DEBT.WAIVE",
    "ACTION.SETTLEMENT.CONFIRM",
    "ACTION.SETTLEMENT.REVERSE",
  ]) assert.ok(contract.includes(`| \`${id}\` |`), id);
  assert.match(contract, /RENT_PAYMENT_TRANSACTION_RECOMMENDATION/);
  assert.match(contract, /SETTLEMENT_TRANSACTION_RECOMMENDATION/);
  assert.match(contract, /FINANCIAL_ACTION_REFERENCE_PATTERN/);
  assert.match(contract, /NO_TRANSACTION_REFACTOR_REQUIRED/);
});

test("Debt Waiver keeps server dedupe and now has a client pending guard", () => {
  assert.match(tenants, /waivingDebtPaymentId/);
  assert.match(tenants, /setWaivingDebtPaymentId\(debtCase\.paymentId\)/);
  assert.match(tenants, /disabled=\{saving \|\| waivingDebtPaymentId ===/);
  assert.match(contract, /CLIENT_PENDING_GAP = RESOLVED/);
  assert.match(readFileSync("app/api/rent-collection/route.ts", "utf8"), /audit_logs/);
});

test("Rent and Expense keep explicit core-write versus attachment boundaries", () => {
  assert.match(rentPayments, /saveBusinessData\(rentPaymentKey, next/);
  assert.match(rentPayments, /uploadRentPaymentFile/);
  assert.match(rentPayments, /window\.alert\(\`/);
  assert.match(expenses, /saveBusinessData\(expenseKey, next/);
  assert.match(expenses, /uploadExpenseFile/);
  assert.match(expenses, /window\.alert\(\`/);
  assert.match(contract, /PARTIAL_SUCCESS_RISK/);
});

test("Deposit reference path retains final-state verification", () => {
  assert.match(deposits, /refreshedTargetDeposits/);
  assert.match(deposits, /confirmed/);
  assert.match(contract, /FINANCIAL_ACTION_REFERENCE_PATTERN/);
});

test("Settlement keeps per-property loop and partial-success risk", () => {
  assert.match(settlement, /for \(const propertyId of selectedPropertyIds\)/);
  assert.match(settlement, /api\/partner-settlements/);
  assert.match(contract, /ACTION\.SETTLEMENT\.CONFIRM[\s\S]*PARTIAL_SUCCESS_RISK/);
  assert.match(contract, /no batch idempotency key/);
});

test("Settlement reversal remains a single RPC boundary with reason", () => {
  assert.match(reversal, /reverse_partner_settlement/);
  assert.match(reversal, /reason/);
  assert.match(contract, /ACTION\.SETTLEMENT\.REVERSE[\s\S]*UNKNOWN/);
});

test("financial pages do not introduce direct Supabase business-table mutation", () => {
  const source = [tenants, rentPayments, expenses, deposits, settlement].join("\n");
  assert.doesNotMatch(source, /\.from\(["'](?:rent_payments|expenses|deposits|audit_logs|partner_settlement_batches)["']\)\s*\.\s*(?:insert|update|delete|upsert)\(/);
});
