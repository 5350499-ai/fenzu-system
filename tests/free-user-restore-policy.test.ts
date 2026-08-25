import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source .ts file directly.
import { getRestoreCapability } from "../lib/restore-capability.ts";

const route = readFileSync("app/api/data-restore/route.ts", "utf8");
const page = readFileSync("app/data-center/page.tsx", "utf8");

test("free_single capability requires local pre-restore backup and disables cloud recovery", () => {
  assert.deepEqual(getRestoreCapability({ accountType: "custom", accountPlan: "free_single" }), {
    freeUser: true,
    cloudRecoveryEnabled: false,
    historyRecoveryEnabled: false,
    automaticCloudBackupEnabled: false,
    localPreRestoreBackupRequired: true
  });
});

test("managed and owner accounts retain cloud recovery capability", () => {
  assert.equal(getRestoreCapability({ accountType: "owner", accountPlan: "managed" }).cloudRecoveryEnabled, true);
  assert.equal(getRestoreCapability({ accountType: "custom", accountPlan: "managed" }).cloudRecoveryEnabled, true);
});

test("free-user restore route blocks cloud BeforeRestore and requires local confirmation", () => {
  assert.match(route, /free_user_cloud_before_restore_disabled/);
  assert.match(route, /local_pre_restore_backup_required/);
  assert.match(route, /localPreRestoreBackupConfirmed/);
  assert.match(route, /body\.dryRunPassed !== true/);
  assert.match(route, /cloudRecoveryPointCreated: false/);
});

test("free-user UI uses the local backup gate and keeps the restore target payload", () => {
  assert.match(page, /备份当前数据到本机/);
  assert.match(page, /我已将恢复前备份保存到安全位置/);
  assert.match(page, /localPreRestoreBackupChecksum/);
  assert.match(page, /parsedBackupPayload !== payload/);
  assert.doesNotMatch(page, /系统将自动创建一份当前数据 Backup/);
  assert.match(page, /执行恢复演练/);
  assert.match(page, /我已将恢复前备份保存到安全位置/);
});

test("free-user main flow does not auto-handoff a local file before the rehearsal", () => {
  const prepareStart = page.indexOf("async function prepareBeforeRestore");
  const localStart = page.indexOf("async function prepareLocalPreRestoreBackup");
  assert.ok(prepareStart >= 0 && localStart > prepareStart);
  const cloudPreparation = page.slice(prepareStart, localStart);
  assert.doesNotMatch(cloudPreparation, /saveFileWithSystemFallback/);
  assert.match(page, /onPrepareLocalPreRestoreBackup/);
});
