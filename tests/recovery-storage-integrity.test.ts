import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
// @ts-expect-error Node's strip-types test runner needs the explicit extension.
import { classifyRecoveryStorageState } from "../lib/server/recovery-storage-policy.ts";

const base = { metadataExists: true, objectExists: true, checksumValid: true, payloadValid: true, pathBelongsToWorkspace: true };
test("storage integrity classifies healthy and missing objects", () => {
  assert.equal(classifyRecoveryStorageState(base), "HEALTHY");
  assert.equal(classifyRecoveryStorageState({ ...base, objectExists: false }), "ERROR");
});

test("support recovery is owner-scoped metadata and dry-run only", () => {
  const route = readFileSync("app/api/admin/recovery-points/route.ts", "utf8");
  assert.match(route, /requireActiveAccount\(request, true\)/);
  assert.match(route, /workspace_owner_id/);
  assert.match(route, /reason/);
  assert.match(route, /dryRun/);
  assert.doesNotMatch(route, /restore_workspace_backup/);
});
test("orphan, corruption, expiry and path security are fail-closed", () => {
  assert.equal(classifyRecoveryStorageState({ ...base, metadataExists: false }), "ORPHAN_REVIEW_REQUIRED");
  assert.equal(classifyRecoveryStorageState({ ...base, checksumValid: false }), "CORRUPT");
  assert.equal(classifyRecoveryStorageState({ ...base, zeroBytes: true }), "CORRUPT");
  assert.equal(classifyRecoveryStorageState({ ...base, expired: true }), "EXPIRED");
  assert.equal(classifyRecoveryStorageState({ ...base, pathBelongsToWorkspace: false }), "SECURITY_ERROR");
});
