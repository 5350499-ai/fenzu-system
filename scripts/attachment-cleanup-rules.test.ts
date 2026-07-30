import assert from "node:assert/strict";
import test from "node:test";
import { buildAttachmentArchiveManifest, ATTACHMENT_ARCHIVE_ENABLED } from "../lib/attachment-archive";
import { ATTACHMENT_CLEANUP_EXECUTION_ENABLED, cleanupStorageOutcomePlan, evaluateCleanupCandidate, isCleanupPreviewWindowValid } from "../lib/attachment-cleanup-rules";
import { buildTaskMigrationPreview, normalizeTaskStatus, TASKS_SERVER_SYNC_ENABLED, taskBlocksCleanup } from "../lib/task-management";

const cutoff = "2026-04-30";
const base = { movedOut: true, hasActiveContract: false, depositState: "complete" as const, taskState: "clear" as const, roomState: "released" as const };

test("cleanup eligibility requires the full fail-closed rule set", () => {
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: null }, cutoff), { eligible: false, reason: "missing_move_out_date" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: "2026-05-01" }, cutoff), { eligible: false, reason: "not_old_enough" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff }, cutoff), { eligible: true });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff, hasActiveContract: true }, cutoff), { eligible: false, reason: "active_contract" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff, depositState: "unknown" }, cutoff), { eligible: false, reason: "deposit_state_unknown" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff, taskState: "pending" }, cutoff), { eligible: false, reason: "pending_tasks" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff, taskState: "unknown" }, cutoff), { eligible: false, reason: "task_state_unknown" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff, taskState: "unavailable" }, cutoff), { eligible: false, reason: "task_source_unavailable" });
  assert.deepEqual(evaluateCleanupCandidate({ ...base, actualMoveOutDate: cutoff, roomState: "occupied" }, cutoff), { eligible: false, reason: "room_still_occupied" });
});

test("preview expiry and storage outcome handling remain safe", () => {
  assert.equal(isCleanupPreviewWindowValid(1_000, 1_000), true);
  assert.equal(isCleanupPreviewWindowValid(999, 1_000), false);
  assert.deepEqual(cleanupStorageOutcomePlan("deleted"), { auditStatus: "deleted", removeAttachmentIndex: true });
  assert.deepEqual(cleanupStorageOutcomePlan("missing"), { auditStatus: "missing", removeAttachmentIndex: true });
  assert.deepEqual(cleanupStorageOutcomePlan("failed"), { auditStatus: "failed", removeAttachmentIndex: false });
  assert.equal(ATTACHMENT_CLEANUP_EXECUTION_ENABLED, false);
});

test("archive manifest is metadata-only and archive execution starts disabled", () => {
  const csv = buildAttachmentArchiveManifest([{
    recordLabel: "tenant-room",
    room: "501",
    moveOutDate: "2026-04-30",
    category: "contracts",
    fileName: "a,contract.pdf",
    mimeType: "application/pdf",
    fileSize: 123,
    uploadedAt: "2026-01-01T00:00:00Z"
  }], "2026-07-30T00:00:00Z");
  assert.match(csv, /"a,contract\.pdf"/);
  assert.match(csv, /"not-generated"/);
  assert.equal(ATTACHMENT_ARCHIVE_ENABLED, false);
});

test("server task statuses are normalized without allowing unknown values", () => {
  assert.equal(normalizeTaskStatus("pending"), "pending");
  assert.equal(normalizeTaskStatus("待处理"), "pending");
  assert.equal(normalizeTaskStatus("completed"), "completed");
  assert.equal(normalizeTaskStatus("已取消"), "cancelled");
  assert.equal(normalizeTaskStatus("unexpected"), "unknown");
  assert.equal(taskBlocksCleanup({ tenantId: "tenant-1", status: "pending" }, "tenant-1"), true);
  assert.equal(taskBlocksCleanup({ tenantId: "tenant-1", status: "completed" }, "tenant-1"), false);
  assert.equal(taskBlocksCleanup({ tenantId: "", status: "pending" }, "tenant-1"), false);
  assert.equal(TASKS_SERVER_SYNC_ENABLED, false);
});

test("local task migration preview uses stable keys and does not upload", () => {
  const task = { title: "退押金", dueDate: "2026-07-30", status: "pending", priority: "high", tenantId: "tenant-1" };
  const preview = buildTaskMigrationPreview([task, { ...task }, { title: "普通待办", status: "pending" }], []);
  assert.equal(preview.total, 3);
  assert.equal(preview.migratable, 1);
  assert.equal(preview.duplicate, 1);
  assert.equal(preview.unlinked, 1);
  assert.equal(preview.invalid, 0);
  assert.equal(buildTaskMigrationPreview([task], [{ id: "server-1", ...task }]).duplicate, 1);
});
