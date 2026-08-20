import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reminders = readFileSync("lib/backup-reminders.ts", "utf8");
const statusRoute = readFileSync("app/api/data-backup/status/route.ts", "utf8");
const completeRoute = readFileSync("app/api/data-backup/complete/route.ts", "utf8");
const dataCenter = readFileSync("app/data-center/page.tsx", "utf8");
const settings = readFileSync("app/settings/page.tsx", "utf8");

test("server audit is the authoritative backup reminder source", () => {
  assert.match(reminders, /\/api\/data-backup\/status/);
  assert.match(statusRoute, /successful_data_backup_export/);
  assert.match(statusRoute, /entity_id.*workspace_owner_id|workspace_owner_id.*entity_id/);
  assert.match(completeRoute, /successful_data_backup_export/);
  assert.match(completeRoute, /writeAuditLog/);
});

test("only a completed export records the server backup timestamp", () => {
  assert.match(dataCenter, /await recordSuccessfulBackup\(session\.access_token\)/);
  assert.doesNotMatch(dataCenter, /markSuccessfulBackup\(session\.user\.id\);/);
  assert.match(settings, /数据备份提醒/);
  assert.match(settings, /在提醒中心提醒你再次备份/);
  assert.doesNotMatch(settings, /\u6570\u636e\u5907\u4efd\u63d0\u9192\uff08\u5e94\u7528\u5185\uff09|\u5e94\u7528\u5185\u63d0\u9192/);
});

test("local storage remains a cache and the reminder is account scoped", () => {
  assert.match(reminders, /STORAGE_PREFIX\s*=\s*["']fenzu-backup-reminder:["']/);
  assert.match(reminders, /storageKey\(userId\)/);
  assert.match(reminders, /lastSuccessfulBackupAt: typeof payload\.lastSuccessfulBackupAt/);
});
