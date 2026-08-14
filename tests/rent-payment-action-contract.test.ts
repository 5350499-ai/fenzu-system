import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/rent-payments/page.tsx", "utf8");
const contract = readFileSync("ACTION_TREE_CONTRACT.md", "utf8");

test("rent payment has one core write and explicit side-effect ownership", () => {
  assert.match(page, /saveBusinessData\(rentPaymentKey, next/);
  assert.match(page, /saveBusinessData\(depositKey, nextDeposits/);
  assert.match(page, /saveBusinessData\(tenantKey, nextTenants/);
  assert.match(page, /uploadRentPaymentFile/);
  assert.match(contract, /`CORE_ACTION`: save the `rent_payments` collection/);
  assert.match(contract, /`SIDE_EFFECTS`: linked deposit persistence/);
});

test("the existing saving guard covers the form submit path", () => {
  assert.match(page, /setSaving\(true\)/);
  assert.match(page, /if \(!loaded \|\| saving\) return;/);
  assert.match(page, /disabled=\{saving\} type="submit"/);
  assert.match(page, /finally \{\s*setSaving\(false\);/);
  assert.match(contract, /RENT_PAYMENT_SERVER_IDEMPOTENCY_PENDING/);
});

test("core success is committed to local payment state before side effects", () => {
  const coreWrite = page.indexOf("saveBusinessData(rentPaymentKey, next");
  const localPaymentState = page.indexOf("setPayments(next)", coreWrite);
  const depositSideEffect = page.indexOf("saveBusinessData(depositKey", localPaymentState);
  const tenantSideEffect = page.indexOf("saveBusinessData(tenantKey", localPaymentState);
  assert.ok(coreWrite >= 0);
  assert.ok(localPaymentState > coreWrite);
  assert.ok(depositSideEffect > localPaymentState);
  assert.ok(tenantSideEffect > localPaymentState);
});

test("side-effect failures are partial success, not core payment failure", () => {
  assert.match(page, /const sideEffectFailures: string\[\] = \[\]/);
  assert.match(page, /sideEffectFailures\.push\("押金记录"\)/);
  assert.match(page, /sideEffectFailures\.push\("租客月租更新"\)/);
  assert.match(page, /sideEffectFailures\.push\("附件上传"\)/);
  assert.match(page, /收款记录已经保存，但部分后续操作未完成/);
  assert.match(page, /请不要重新提交整笔收款/);
  assert.match(page, /收款未保存，请重试/);
  assert.match(contract, /CORE_SUCCESS_WITH_SIDE_EFFECT_FAILURE/);
});

test("rent payment contract keeps unresolved server idempotency explicit", () => {
  assert.match(contract, /`ACTION\.RENT_PAYMENT\.SAVE`[\s\S]*PARTIAL_SUCCESS_RISK/);
  assert.match(contract, /RENT_PAYMENT_SERVER_IDEMPOTENCY_PENDING/);
  assert.match(contract, /must not recreate the core payment/);
});
