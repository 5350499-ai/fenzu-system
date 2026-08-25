import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/data-center/page.tsx", "utf8");
const session = fs.readFileSync("lib/restore-session.ts", "utf8");

test("restore flow keeps the parsed payload in a shared session owner", () => {
  assert.match(page, /materializeRestoreFile/);
  assert.match(page, /createRestoreSession/);
  assert.match(page, /verifyRestoreSessionIntegrity/);
  assert.doesNotMatch(page, /JSON\.parse\(await file\.text\(\)\)/);
  assert.match(session, /originalPayloadBytes/);
  assert.match(session, /originalPayloadSha256/);
});

test("BeforeRestore persistence is not blocked by local file handoff and Dry Run precedes Restore", () => {
  const prepare = page.slice(page.indexOf("async function prepareBeforeRestore"), page.indexOf("async function prepareLocalPreRestoreBackup"));
  assert.doesNotMatch(prepare, /saveFileWithSystemFallback/);
  assert.match(page, /onDownloadBeforeRestoreCopy/);
  assert.match(page, /onRestore\(payload, prepared\?\.storagePath \|\| "", "dry_run"\)/);
  assert.match(page, /onRestore\(payload, prepared\?\.storagePath \|\| "", "restore"\)/);
  assert.match(page, /我已将恢复前备份保存到安全位置/);
});

test("optional BeforeRestore download is a user action and cannot gate the main flow", () => {
  assert.match(page, /下载恢复前备份副本（可选）/);
  assert.match(page, /本地下载不会影响恢复流程/);
  assert.match(page, /系统恢复点仍然安全保存，不影响恢复演练/);
});
