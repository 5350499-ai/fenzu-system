import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const passwordInput = readFileSync(new URL("../components/password-input.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");
const resetPassword = readFileSync(new URL("../app/reset-password/page.tsx", import.meta.url), "utf8");
const security = readFileSync(new URL("../app/settings/security/page.tsx", import.meta.url), "utf8");
const accountCenter = readFileSync(new URL("../components/account-center.tsx", import.meta.url), "utf8");
const accounts = readFileSync(new URL("../app/accounts/page.tsx", import.meta.url), "utf8");
const profits = readFileSync(new URL("../app/property-profits/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("PASSWORD_CLEAR_LOGIN_TEST", () => assert.match(login, /<PasswordInput name="password" value=\{password\} onValueChange=\{setPassword\} autoComplete="current-password"/));

test("PASSWORD_CLEAR_REGISTER_TEST", () => {
  assert.match(register, /<PasswordInput name="new-password"/);
  assert.match(register, /<PasswordInput name="confirm-password"/);
});

test("PASSWORD_CLEAR_ACCOUNT_CENTER_TEST", () => {
  assert.match(accountCenter, /import \{ PasswordInput \}/);
  assert.match(accountCenter, /<PasswordInput\s+visible=\{show\}/);
  assert.match(security, /<PasswordInput id="security-current-password"/);
  assert.match(resetPassword, /<PasswordInput id="reset-password"/);
  assert.match(accounts, /<PasswordInput autoComplete="new-password"/);
});

test("PASSWORD_CLEAR_PRESERVES_FOCUS", () => {
  assert.match(passwordInput, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(passwordInput, /requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/);
});

test("PASSWORD_CLEAR_DOES_NOT_SUBMIT", () => {
  assert.match(passwordInput, /className="password-input-clear"\s+type="button"\s+aria-label=/);
  assert.match(passwordInput, /onClick=\{clearValue\}/);
});

test("PASSWORD_FIELDS_CLEAR_INDEPENDENTLY", () => {
  assert.match(passwordInput, /onValueChange\(""\)/);
  assert.match(register, /onValueChange=\{setPasswordConfirmation\}/);
  assert.match(security, /onValueChange=\{setConfirmation\}/);
});

test("PROPERTY_PROFIT_STATUS_BADGE_TEST", () => {
  assert.match(profits, /unified-monthly-status-region">\s*<StatusBadge/);
  assert.match(profits, /className="unified-monthly-status-badge"/);
  assert.doesNotMatch(profits, /unified-monthly-status-value/);
});

test("POSITIVE_STATUS_BADGE_TEST", () => assert.match(profits, /netProfit > 0 \? "green"/));
test("NEGATIVE_STATUS_BADGE_TEST", () => assert.match(profits, /netProfit < 0 \? "red"/));

test("STATUS_BADGE_NO_LAYOUT_REGRESSION", () => {
  assert.match(css, /\.unified-monthly-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.1fr\) max-content minmax\(0, 1\.35fr\)/);
  assert.match(css, /\.unified-monthly-status-badge\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.unified-monthly-amount\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
});

test("NO_AMOUNT_SPLIT and NO_HORIZONTAL_OVERFLOW", () => {
  assert.match(css, /\.field \.password-input > input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.password-input-clear\s*\{[\s\S]*?inline-size:\s*var\(--ui-touch-target, 44px\)/);
});
