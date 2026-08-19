import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const management = readFileSync("lib/server/account-management.ts", "utf8");
const wrapper = readFileSync("lib/server/synthetic-qa-bootstrap.ts", "utf8");

test("canonical custom-account bootstrap has ordered compensation cleanup", () => {
  assert.match(management, /async function cleanupProvisionedAccount\(targetId: string\)/);
  assert.match(management, /from\("user_profiles"\)\.delete\(\)\.eq\("auth_user_id", targetId\)/);
  assert.match(management, /await admin\.auth\.admin\.deleteUser\(targetId\)/);
  assert.match(management, /createCustomAccount\([\s\S]*options: AccountBootstrapOptions = \{\}/);
});

test("synthetic bootstrap is server-only, disabled by default, and secret-gated", () => {
  assert.match(wrapper, /import "server-only"/);
  assert.match(wrapper, /SYNTHETIC_QA_BOOTSTRAP_ENABLED !== "true"/);
  assert.match(wrapper, /SYNTHETIC_QA_BOOTSTRAP_SECRET/);
  assert.match(wrapper, /timingSafeEqual/);
  assert.match(wrapper, /SYNTHETIC AUTOMATED QA/);
  assert.match(wrapper, /accountPlan: FREE_SINGLE_PLAN/);
});

test("synthetic bootstrap does not accept caller identity or business data", () => {
  assert.doesNotMatch(wrapper, /options\.email/);
  assert.doesNotMatch(wrapper, /options\.password/);
  assert.doesNotMatch(wrapper, /from\("properties"\)/);
  assert.doesNotMatch(wrapper, /from\("tenants"\)/);
  assert.match(wrapper, /email_confirmed|createCustomAccount/);
});

test("failure injection is unavailable in Production", () => {
  assert.match(wrapper, /process\.env\.NODE_ENV === "production"/);
  assert.match(management, /injectBootstrapFailure\(options, "profile"\)/);
  assert.match(management, /injectBootstrapFailure\(options, "permissions"\)/);
  assert.match(management, /injectBootstrapFailure\(options, "audit"\)/);
});
