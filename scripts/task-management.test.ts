import assert from "node:assert/strict";
import test from "node:test";
import {
  isTasksServerSyncEnabled,
  buildTaskMigrationPreview,
  isCalendarDate,
  isUuid,
  normalizeTaskForServer,
  normalizeTaskStatus,
  taskBlocksCleanup,
  taskMigrationKey
} from "../lib/task-management";

const tenantId = "11111111-1111-4111-8111-111111111111";
const roomId = "22222222-2222-4222-8222-222222222222";
const propertyId = "33333333-3333-4333-8333-333333333333";
const base = { id: "44444444-4444-4444-8444-444444444444", title: "退房检查", dueDate: "2026-08-01", status: "pending" as const, priority: "normal", tenantId, roomId, propertyId };

test("server task flag stays disabled until a separately authorized rollout", () => {
  assert.equal(isTasksServerSyncEnabled(), false);
  const previous = process.env.NEXT_PUBLIC_TASKS_SERVER_SYNC_ENABLED;
  process.env.NEXT_PUBLIC_TASKS_SERVER_SYNC_ENABLED = "true";
  assert.equal(isTasksServerSyncEnabled(), true);
  process.env.NEXT_PUBLIC_TASKS_SERVER_SYNC_ENABLED = "garbage";
  assert.equal(isTasksServerSyncEnabled(), false);
  if (previous === undefined) delete process.env.NEXT_PUBLIC_TASKS_SERVER_SYNC_ENABLED;
  else process.env.NEXT_PUBLIC_TASKS_SERVER_SYNC_ENABLED = previous;
});

test("task status and calendar validation reject unsafe values", () => {
  assert.equal(normalizeTaskStatus("待处理"), "pending");
  assert.equal(normalizeTaskStatus("已完成"), "completed");
  assert.equal(normalizeTaskStatus("已取消"), "cancelled");
  assert.equal(normalizeTaskStatus("unexpected"), "unknown");
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isUuid(tenantId), true);
  assert.equal(isUuid("not-a-uuid"), false);
});

test("migration preview preserves normal tasks and identifies exact duplicates", () => {
  const ordinary = { id: "55555555-5555-4555-8555-555555555555", title: "联系房东", status: "pending" };
  const sameTitleDifferentDate = { ...base, id: "66666666-6666-4666-8666-666666666666", dueDate: "2026-08-02" };
  const preview = buildTaskMigrationPreview([base, ordinary, { ...base }, sameTitleDifferentDate, { title: "无效关联", status: "pending", tenantId: "invalid" }], []);
  assert.equal(preview.total, 5);
  assert.equal(preview.migratable, 2);
  assert.equal(preview.unlinked, 1);
  assert.equal(preview.readyToMigrate, 3);
  assert.equal(preview.duplicate, 1);
  assert.equal(preview.invalid, 1);
  assert.equal(buildTaskMigrationPreview([{ ...base, remoteId: "server-1" }], [{ ...base, id: "server-1" }]).duplicate, 1);
  const restricted = buildTaskMigrationPreview([ordinary], [], { allowUnlinked: false });
  assert.equal(restricted.readyToMigrate, 0);
  assert.equal(restricted.rows[0].skipReason, "当前账号无权迁移未关联房源的普通待办");
});

test("task migration keys do not merge distinct task dates or status", () => {
  assert.notEqual(taskMigrationKey(base), taskMigrationKey({ ...base, dueDate: "2026-08-02" }));
  assert.notEqual(taskMigrationKey(base), taskMigrationKey({ ...base, status: "completed" }));
});

test("cleanup blocks only pending tasks that are linked to the same tenant", () => {
  assert.equal(taskBlocksCleanup({ tenantId, status: "pending" }, tenantId), true);
  assert.equal(taskBlocksCleanup({ tenantId, status: "completed" }, tenantId), false);
  assert.equal(taskBlocksCleanup({ tenantId: "", status: "pending" }, tenantId), false);
});

test("invalid task links are never normalized for server migration", () => {
  assert.equal(normalizeTaskForServer(base)?.tenantId, tenantId);
  assert.equal(normalizeTaskForServer({ ...base, tenantId: "not-a-uuid" }), null);
});
