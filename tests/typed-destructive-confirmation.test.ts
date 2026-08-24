import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { DELETE_CONFIRMATION_TOKEN, isValidDeleteConfirmation } from "../lib/destructive-confirmation.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { isTenantDeleteConfirmed } from "../lib/tenant-delete.ts";

const ui = readFileSync("components/ui.tsx", "utf8");
const payments = readFileSync("app/rent-payments/page.tsx", "utf8");
const tenants = readFileSync("app/tenants/page.tsx", "utf8");

test("shared DELETE confirmation is exact, case-sensitive and trimmed", () => {
  assert.equal(DELETE_CONFIRMATION_TOKEN, "DELETE");
  assert.equal(isValidDeleteConfirmation("DELETE"), true);
  assert.equal(isValidDeleteConfirmation(" DELETE "), true);
  assert.equal(isValidDeleteConfirmation("delete"), false);
  assert.equal(isValidDeleteConfirmation("Delete"), false);
  assert.equal(isValidDeleteConfirmation("删除"), false);
  assert.equal(isValidDeleteConfirmation("BORRAR"), false);
});

test("typed dialog owns reset, disabled and accessible input behavior", () => {
  assert.match(ui, /function TypedDestructiveConfirmDialog/);
  assert.match(ui, /if \(!open\) setConfirmation\(""\)/);
  assert.match(ui, /disabled=\{saving \|\| !isValidDeleteConfirmation\(confirmation\)\}/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /htmlFor=\{inputId\}/);
  assert.match(ui, /请输入 \{DELETE_CONFIRMATION_TOKEN\} 以确认/);
});

test("rent payment delete uses the typed dialog and canonical receipt snapshot", () => {
  assert.match(payments, /TypedDestructiveConfirmDialog/);
  assert.match(payments, /projectRentPaymentReceipt\(payment, linkedDepositsByPaymentId\.get\(payment\.id\), checkInReceiptLinks\)/);
  assert.match(payments, /receipt\.rentAmount/);
  assert.match(payments, /receipt\.depositAmount/);
  assert.match(payments, /receipt\.totalReceived/);
  assert.match(payments, /open=\{lifecycleConfirmation\?\.action === "delete"\}/);
  assert.match(payments, /open=\{lifecycleConfirmation\?\.action === "void"\}/);
  assert.equal((payments.match(/applyRentPaymentLifecycle\(payment\.id, action\)/g) || []).length, 1);
});

test("tenant compatibility delegates to the shared validator and remains server-disabled", () => {
  assert.equal(isTenantDeleteConfirmed(" DELETE "), true);
  assert.equal(isTenantDeleteConfirmed("delete"), false);
  assert.match(readFileSync("lib/tenant-delete.ts", "utf8"), /isValidDeleteConfirmation/);
  assert.match(tenants, /isTenantDeleteConfirmed\(deleteConfirmation\)/);
  assert.match(readFileSync("app/api/business-data/route.ts", "utf8"), /TENANT_PERMANENT_DELETE_DISABLED/);
});
