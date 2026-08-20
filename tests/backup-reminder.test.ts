import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner needs the explicit extension.
import { defaultBackupReminderSettings, isBackupReminderDue, markSuccessfulBackup, nextBackupReminderAt } from "../lib/backup-reminders.ts";

test("backup reminder does not become overdue before the first successful export", () => {
  const settings = defaultBackupReminderSettings("2026-01-01T00:00:00.000Z");
  assert.equal(nextBackupReminderAt(settings), null);
  assert.equal(isBackupReminderDue(settings, new Date("2027-01-01T00:00:00.000Z")), false);
});

test("successful export starts the selected reminder period", () => {
  const settings = markSuccessfulBackup("", "2026-01-20T10:00:00.000Z");
  const dueAt = nextBackupReminderAt(settings);
  assert.ok(dueAt);
  assert.equal(dueAt!.toISOString(), "2026-02-20T10:00:00.000Z");
  assert.equal(isBackupReminderDue(settings, new Date("2026-02-19T23:59:59.000Z")), false);
  assert.equal(isBackupReminderDue(settings, new Date("2026-02-20T10:00:00.000Z")), true);
});

test("a later successful export resets the next reminder baseline", () => {
  const first = { ...defaultBackupReminderSettings("2026-01-01T00:00:00.000Z"), lastSuccessfulBackupAt: "2026-01-20T10:00:00.000Z" };
  const second = { ...first, lastSuccessfulBackupAt: "2026-02-25T10:00:00.000Z" };
  assert.equal(nextBackupReminderAt(first)!.toISOString(), "2026-02-20T10:00:00.000Z");
  assert.equal(nextBackupReminderAt(second)!.toISOString(), "2026-03-25T10:00:00.000Z");
});
