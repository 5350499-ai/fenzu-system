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

test("currency save keeps the workspace scope and does not mutate amounts", () => {
  assert.match(route, /requireActiveAccount\(request\)/);
  assert.match(route, /requireSensitivePermission\(context, "canManageSettings"\)/);
  assert.match(route, /currency_code: requested/);
  assert.match(route, /不转换历史金额/);
  assert.doesNotMatch(route, /amount|amount_paid|amount_due|exchange|汇率/);
});

test("currency save maps auth, permission, conflict and server failures separately", () => {
  assert.match(settings, /response\.status === 401/);
  assert.match(settings, /response\.status === 403/);
  assert.match(settings, /response\.status === 409/);
  assert.match(settings, /保存货币失败，请稍后重试/);
});
