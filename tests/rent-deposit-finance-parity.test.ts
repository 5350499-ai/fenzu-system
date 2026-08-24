import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BusinessDeposit, BusinessRentPayment } from "../lib/business-data.ts";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { classifyRentDepositFinance, projectDepositIncomePayments, projectRentPaymentReceipt } from "../lib/rent-deposit-finance.ts";

const payment = (id: string, rent: number, overrides: Partial<BusinessRentPayment> = {}): BusinessRentPayment => ({
  id,
  propertyId: "property-1",
  roomId: "room-1",
  tenantId: "tenant-1",
  incomeType: "续交房租",
  incomeItem: "续交房租",
  rentMonth: "2026-08",
  paymentDate: "2026-08-20",
  amountDue: rent,
  amountPaid: rent,
  amountUnpaid: 0,
  paymentMethod: "现金",
  receivedBy: "owner",
  paymentStatus: "已收",
  isOverdue: false,
  notes: "",
  ...overrides
});

const deposit = (id: string, paymentId: string | null, amount: number, overrides: Partial<BusinessDeposit> = {}): BusinessDeposit => ({
  id,
  propertyId: "property-1",
  roomId: "room-1",
  tenantId: "tenant-1",
  type: "收取",
  amount,
  status: "已收",
  transactionDate: "2026-08-20",
  receivedBy: "owner",
  notes: paymentId ? `[收租押金:${paymentId}]` : "",
  ...overrides
});

function ledgerTotal(payments: BusinessRentPayment[], deposits: BusinessDeposit[]) {
  return [...payments, ...projectDepositIncomePayments(deposits, payments)]
    .reduce((total, item) => total + Number(item.amountPaid || 0), 0);
}

test("new separated renewal receipt keeps rent and linked deposit distinct and counts both once", () => {
  const cases = [[100, 200, 300], [1, 2, 3]] as const;
  for (const [rent, depositAmount, expectedTotal] of cases) {
    const rentPayment = payment(`payment-${rent}`, rent);
    const linkedDeposit = deposit(`deposit-${rent}`, rentPayment.id, depositAmount);
    assert.deepEqual(projectRentPaymentReceipt(rentPayment, linkedDeposit), {
      rentAmount: rent,
      depositAmount,
      totalReceived: expectedTotal,
      legacyMixedDeposit: false,
      classification: "NEW_SEPARATED_RENEWAL"
    });
    const projected = projectDepositIncomePayments([linkedDeposit], [rentPayment]);
    assert.equal(projected.length, 1);
    assert.equal(projected[0].amountPaid, depositAmount);
    assert.equal(ledgerTotal([rentPayment], [linkedDeposit]), expectedTotal);
  }
});

test("rent-only and deposit-only receipts preserve their independent financial meaning", () => {
  const rentOnly = payment("rent-only", 100);
  assert.equal(projectRentPaymentReceipt(rentOnly).totalReceived, 100);
  assert.equal(ledgerTotal([rentOnly], []), 100);

  const depositOnly = deposit("deposit-only", null, 200);
  const projected = projectDepositIncomePayments([depositOnly], []);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].incomeType, "押金收入");
  assert.equal(projected[0].amountPaid, 200);
  assert.equal(ledgerTotal([], [depositOnly]), 200);
});

test("historical mixed rent and linked deposit remain one receipt without double count", () => {
  const legacy = payment("legacy-mixed", 100, { amountPaid: 300 });
  const linkedDeposit = deposit("legacy-deposit", legacy.id, 200);
  assert.deepEqual(projectRentPaymentReceipt(legacy, linkedDeposit), {
      rentAmount: 100,
      depositAmount: 200,
      totalReceived: 300,
      legacyMixedDeposit: true,
      classification: "LEGACY_MIXED_RENEWAL"
  });
  assert.equal(projectDepositIncomePayments([linkedDeposit], [legacy]).length, 0);
  assert.equal(ledgerTotal([legacy], [linkedDeposit]), 300);
});

test("existing source-linked deposit ledger prevents a second deposit projection", () => {
  const rentPayment = payment("payment-source-linked", 100);
  const linkedDeposit = deposit("deposit-source-linked", rentPayment.id, 200);
  const depositLedger = payment("deposit-ledger", 0, {
    sourceDepositId: linkedDeposit.id,
    incomeType: "押金收入",
    incomeItem: "押金收入",
    amountDue: 0,
    amountPaid: 200
  });
  assert.equal(projectDepositIncomePayments([linkedDeposit], [rentPayment, depositLedger]).length, 0);
  assert.equal(ledgerTotal([rentPayment, depositLedger], [linkedDeposit]), 300);
  const pageSource = readFileSync("app/rent-payments/page.tsx", "utf8");
  assert.match(pageSource, /const displayedStoredPayments = payments\.filter/);
  assert.match(pageSource, /return !linkedPaymentId \|\| !displayedPaymentIds\.has\(linkedPaymentId\)/);
});

test("dashboard and settlement consume the shared projected ledger", () => {
  const rentPayment = payment("payment-parity", 100);
  const linkedDeposit = deposit("deposit-parity", rentPayment.id, 200);
  const ledger = [rentPayment, ...projectDepositIncomePayments([linkedDeposit], [rentPayment])];
  assert.equal(ledger.reduce((total, item) => total + item.amountPaid, 0), 300);
  assert.match(readFileSync("app/page.tsx", "utf8"), /projectDepositIncomePayments\(deposits, rentPayments, checkInReceiptLinks\)/);
  assert.match(readFileSync("app/partnership-settlement/page.tsx", "utf8"), /projectDepositIncomePayments\(deposits, payments, checkInReceiptLinks\)/);
});

test("explicit check-in identity distinguishes historical mixed and new separated receipts", () => {
  const checkInLinks = [{ paymentId: "checkin-payment", depositId: "checkin-deposit" }];
  const linkedDeposit = deposit("checkin-deposit", null, 2);
  const historical = payment("checkin-payment", 1, { incomeType: "房租收入", amountPaid: 3 });
  const current = payment("checkin-payment", 1, { incomeType: "房租收入", amountPaid: 1 });
  assert.equal(classifyRentDepositFinance(historical, linkedDeposit, checkInLinks), "LEGACY_MIXED_CHECKIN");
  assert.equal(classifyRentDepositFinance(current, linkedDeposit, checkInLinks), "NEW_SEPARATED_CHECKIN");
  assert.equal(projectDepositIncomePayments([linkedDeposit], [historical], checkInLinks).length, 0);
  assert.equal(ledgerTotalWithLinks([historical], [linkedDeposit], checkInLinks), 3);
  assert.equal(projectDepositIncomePayments([linkedDeposit], [current], checkInLinks)[0].amountPaid, 2);
  assert.equal(ledgerTotalWithLinks([current], [linkedDeposit], checkInLinks), 3);
});

test("refund lifecycle status alone does not create an automatic expense", () => {
  const returnedStatus = deposit("returned-status", null, 200, { status: "已退", type: "收取" });
  assert.equal(projectDepositIncomePayments([returnedStatus], []).length, 1);
  assert.match(readFileSync("lib/profit.ts", "utf8"), /deposit\.type === "退还"/);
});

test("rent payment page consumes the canonical receipt projection for list and detail", () => {
  const source = readFileSync("app/rent-payments/page.tsx", "utf8");
  assert.match(source, /const receipt = projectRentPaymentReceipt\(payment, linkedDeposit, checkInReceiptLinks\)/);
  assert.match(source, /euro\(receipt\.rentAmount\)/);
  assert.match(source, /euro\(receipt\.depositAmount\)/);
  assert.match(source, /euro\(receipt\.totalReceived\)/);
  assert.doesNotMatch(source, /Math\.max\(Number\(payment\.amountPaid \|\| 0\) - depositAmount/);
});

function ledgerTotalWithLinks(payments: BusinessRentPayment[], deposits: BusinessDeposit[], links: Array<{ paymentId: string; depositId: string }>) {
  return [...payments, ...projectDepositIncomePayments(deposits, payments, links)]
    .reduce((total, item) => total + Number(item.amountPaid || 0), 0);
}
