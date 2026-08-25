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
  assert.match(page, /void saveFileWithSystemFallback\(file\)\.catch/);
  assert.match(page, /onRestore\(payload, prepared\.storagePath, "dry_run"\)/);
  assert.match(page, /onRestore\(payload, prepared\.storagePath, "restore"\)/);
  assert.match(page, /我已查看 Dry Run 报告，可以继续正式恢复/);
});
