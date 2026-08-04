// @ts-expect-error Node's strip-types test runner resolves explicit TS imports.
import { isInternalAuthEmail, passwordValidationMessage } from "../lib/password-security.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("password policy requires length, letters, and numbers", () => {
  assert.match(passwordValidationMessage("short1"), /8/);
  assert.match(passwordValidationMessage("passwordonly"), /字母和数字/);
  assert.equal(passwordValidationMessage("secure123", "secure123"), "");
  assert.match(passwordValidationMessage("secure123", "different123"), /不一致/);
  assert.match(passwordValidationMessage("        "), /不能为空/);
});

test("internal Custom auth emails are not treated as deliverable addresses", () => {
  assert.equal(isInternalAuthEmail("account-test@accounts.fenzu.invalid"), true);
  assert.equal(isInternalAuthEmail("owner@example.com"), false);
});
