import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settings = readFileSync("app/settings/page.tsx", "utf8");
const dataCenter = readFileSync("app/data-center/page.tsx", "utf8");
const reminder = readFileSync("components/backup-reminder-card.tsx", "utf8");
const backupRoute = readFileSync("app/api/data-backup/route.ts", "utf8");
const restoreRoute = readFileSync("app/api/data-restore/route.ts", "utf8");

test("SETTINGS_SINGLE_BACKUP_ENTRY", () => {
  assert.equal((settings.match(/备份与恢复（数据）/g) || []).length, 2);
  assert.doesNotMatch(settings, /数据导出|数据备份提醒/);
  assert.match(settings, /href="\/data-center"/);
});

test("SETTINGS_NO_SEPARATE_BACKUP_REMINDER_CARD", () => {
  assert.doesNotMatch(settings, /backup-reminder|数据备份提醒|lastBackupAt/);
  assert.match(dataCenter, /BackupReminderCard/);
});

test("FREE_USER_BACKUP_VISIBLE", () => {
  assert.match(dataCenter, /title="数据备份"/);
  assert.match(dataCenter, /description="用于以后完整恢复系统，导出 JSON 备份文件。"/);
  assert.match(dataCenter, /title="恢复备份"/);
  assert.match(dataCenter, /title="数据导出"/);
});

test("FREE_USER_RESTORE_VISIBLE", () => {
  assert.match(dataCenter, /canRealRestore=\{access\.isOwner \|\| access\.isFreeSingle\}/);
  assert.match(restoreRoute, /isFreeSingleAccount\(context\)/);
});

test("FREE_USER_BACKUP_REMINDER_VISIBLE", () => {
  assert.match(reminder, /数据备份提醒/);
  assert.match(reminder, /在提醒中心提醒你再次备份/);
});

test("FREE_USER_DATA_EXPORT_VISIBLE", () => {
  assert.match(dataCenter, /导出 Excel \/ CSV，不用于系统恢复/);
  assert.doesNotMatch(dataCenter, /exportFreeSingleJson/);
});

test("ADMIN_ALL_BACKUP_FEATURES_VISIBLE", () => {
  for (const title of ["数据备份", "恢复备份", "数据导出", "自动云备份", "历史恢复"]) assert.match(dataCenter, new RegExp(`title=\"${title}\"`));
});

test("SUBSCRIPTION_ENTITLEMENT_VISIBILITY", () => {
  assert.match(dataCenter, /!access\.isFreeSingle/);
  assert.match(dataCenter, /SubscriptionCard/);
});

test("BACKUP_AND_EXPORT_DISTINCT_COPY", () => {
  assert.match(dataCenter, /用于以后完整恢复系统，导出 JSON 备份文件/);
  assert.match(dataCenter, /不用于系统恢复/);
});

test("SUCCESSFUL_JSON_BACKUP_UPDATES_SERVER_RECORD", () => {
  assert.match(dataCenter, /await recordSuccessfulBackup\(session\.access_token\)/);
  assert.match(backupRoute, /createDataBackup/);
});

test("BACKUP_STATUS_PERSISTS_AFTER_REOPEN", () => {
  assert.match(reminder, /loadServerBackupReminderSettings/);
  assert.match(reminder, /loadServerBackupReminderSettings/);
});

test("BACKUP_REMINDER_MOVED_TO_BACKUP_PAGE", () => {
  assert.match(dataCenter, /<BackupReminderCard \/>/);
  assert.doesNotMatch(settings, /数据备份提醒/);
});
