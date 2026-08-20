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
  assert.match(settings, /数据备份提醒（应用内）/);
  assert.match(settings, /不发送手机推送或邮件/);
});

test("local storage remains a cache and the reminder is account scoped", () => {
  assert.match(reminders, /STORAGE_PREFIX\s*=\s*["']fenzu-backup-reminder:["']/);
  assert.match(reminders, /storageKey\(userId\)/);
  assert.match(reminders, /lastSuccessfulBackupAt: typeof payload\.lastSuccessfulBackupAt/);
});
