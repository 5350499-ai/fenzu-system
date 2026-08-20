import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settings = readFileSync("app/settings/page.tsx", "utf8");
const route = readFileSync("app/api/workspace/currency/route.ts", "utf8");

test("currency save uses the authenticated Supabase access token", () => {
  assert.match(settings, /getValidSupabaseSession/);
  assert.match(settings, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(settings, /method: "PATCH"/);
});

test("currency selection is a draft and does not auto-save", () => {
  assert.match(settings, /setDraftCurrency\(normalizeCurrencyCode\(event\.target\.value\)\)/);
  assert.match(settings, /onClick=\{\(\) => void saveCurrency\(\)\}/);
  assert.match(settings, /draftCurrency === currencyCode/);
  assert.doesNotMatch(settings, /onChange=\{\(event\) => void saveCurrency/);
});

test("currency save keeps the workspace scope and does not mutate amounts", () => {
  assert.match(route, /requireActiveAccount\(request\)/);
  assert.match(route, /requireWorkspaceCurrencyPermission\(context\)/);
  assert.match(route, /currency_code: requested/);
  assert.match(route, /不转换历史金额/);
  assert.doesNotMatch(route, /amount|amount_paid|amount_due|exchange|汇率/);
});

test("permission projection distinguishes free-single owner from ordinary members", () => {
  const auth = readFileSync("lib/server/account-auth.ts", "utf8");
  const accountMe = readFileSync("app/api/accounts/me/route.ts", "utf8");
  assert.match(auth, /isFreeSingleWorkspaceOwner/);
  assert.match(auth, /context\.userId === context\.profile\.workspace_owner_id/);
  assert.match(accountMe, /key === "canManageSettings"/);
  assert.match(accountMe, /isFreeSingleWorkspaceOwner\(context\)/);
});

test("currency save maps auth, permission, conflict and server failures separately", () => {
  assert.match(settings, /response\.status === 401/);
  assert.match(settings, /response\.status === 403/);
  assert.match(settings, /response\.status === 409/);
  assert.match(settings, /保存货币失败，请稍后重试/);
});
