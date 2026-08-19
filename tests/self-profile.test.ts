import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner needs the explicit extension.
import { DEFAULT_ACCOUNT_DISPLAY_NAME, MAX_ACCOUNT_DISPLAY_NAME_LENGTH, normalizeSelfDisplayNameUpdate } from "../lib/self-profile.ts";

const accountMe = readFileSync(new URL("../app/api/accounts/me/route.ts", import.meta.url), "utf8");

test("new public accounts use a neutral display-name default", () => {
  assert.equal(DEFAULT_ACCOUNT_DISPLAY_NAME, "用户");
});

test("self display-name update accepts Chinese and English names", () => {
  assert.deepEqual(normalizeSelfDisplayNameUpdate({ displayName: " 测试用户 " }), { displayName: "测试用户" });
  assert.deepEqual(normalizeSelfDisplayNameUpdate({ displayName: "Bee Owner" }), { displayName: "Bee Owner" });
});

test("self display-name update rejects empty, oversized and cross-user payloads", () => {
  assert.throws(() => normalizeSelfDisplayNameUpdate({ displayName: "  " }), /DISPLAY_NAME_REQUIRED/);
  assert.throws(() => normalizeSelfDisplayNameUpdate({ displayName: "x".repeat(MAX_ACCOUNT_DISPLAY_NAME_LENGTH + 1) }), /DISPLAY_NAME_TOO_LONG/);
  assert.throws(() => normalizeSelfDisplayNameUpdate({ displayName: "越权", userId: "another-user" }), /INVALID_SELF_PROFILE_UPDATE/);
  assert.throws(() => normalizeSelfDisplayNameUpdate({ displayName: "越权", accountType: "owner" }), /INVALID_SELF_PROFILE_UPDATE/);
});

test("current-account PATCH is server-scoped and cannot change auth or permission fields", () => {
  assert.match(accountMe, /normalizeSelfDisplayNameUpdate/);
  assert.match(accountMe, /\.eq\("auth_user_id", context\.userId\)/);
  assert.match(accountMe, /\.eq\("workspace_owner_id", context\.profile\.workspace_owner_id\)/);
  assert.match(accountMe, /update\(\{ display_name: update\.displayName, updated_by: context\.userId \}\)/);
  assert.doesNotMatch(accountMe, /body\.(?:accountType|role|status|permissions|workspaceOwnerId|shares)/);
  assert.match(accountMe, /actionType:\s*"update_own_display_name"/);
});
