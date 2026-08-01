/**
 * Task-domain types and pure helpers.  This module deliberately contains no
 * browser storage or Supabase access so the same validation is used by the
 * server APIs, the migration preview, and the cleanup safety gate.
 */
export const TASKS_SERVER_SYNC_ENABLED = false as const;

export type TaskStatus = "pending" | "completed" | "cancelled" | "unknown";

export type LocalTaskLike = {
  id?: string;
  remoteId?: string;
  title?: string;
  description?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  notes?: string;
  tenantId?: string;
  contractId?: string;
  roomId?: string;
  propertyId?: string;
  taskType?: string;
};

export type ServerTaskLike = Required<Pick<LocalTaskLike, "id" | "title">> & LocalTaskLike & {
  id: string;
  status: Exclude<TaskStatus, "unknown">;
  createdAt?: string;
  updatedAt?: string;
};

export type TaskMigrationDisposition = "migratable" | "unlinked" | "duplicate" | "invalid";

export type TaskMigrationPreview = {
  total: number;
  migratable: number;
  unlinked: number;
  readyToMigrate: number;
  duplicate: number;
  invalid: number;
  rows: Array<{ key: string; task: LocalTaskLike; disposition: TaskMigrationDisposition }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeTaskStatus(value: unknown): TaskStatus {
  const status = String(value || "").trim().toLowerCase();
  if (["pending", "待处理", "待办", "未完成"].includes(status)) return "pending";
  if (["completed", "complete", "已完成", "完成"].includes(status)) return "completed";
  if (["cancelled", "canceled", "已取消", "取消"].includes(status)) return "cancelled";
  return "unknown";
}

export function taskStatusLabel(status: TaskStatus) {
  if (status === "pending") return "待处理";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "未知状态";
}

export function taskBlocksCleanup(task: Pick<LocalTaskLike, "status" | "tenantId">, tenantId: string) {
  return Boolean(task.tenantId === tenantId && normalizeTaskStatus(task.status) === "pending");
}

function normalizePart(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedLink(value: unknown) {
  const link = normalizePart(value);
  return link && isUuid(link) ? link : "";
}

/** Stable business comparison key; it intentionally excludes local-only IDs. */
export function taskMigrationKey(task: LocalTaskLike) {
  return [
    normalizePart(task.taskType || "manual"),
    normalizePart(task.title),
    normalizePart(task.description),
    normalizePart(task.dueDate),
    normalizeTaskStatus(task.status),
    normalizePart(task.priority || "normal"),
    normalizePart(task.notes),
    normalizedLink(task.tenantId),
    normalizedLink(task.contractId),
    normalizedLink(task.roomId),
    normalizedLink(task.propertyId)
  ].join("|");
}

export function taskHasInvalidLinks(task: LocalTaskLike) {
  return [task.tenantId, task.contractId, task.roomId, task.propertyId]
    .some((value) => Boolean(normalizePart(value)) && !isUuid(normalizePart(value)));
}

export function buildTaskMigrationPreview(localTasks: LocalTaskLike[], existingTasks: ServerTaskLike[] = []): TaskMigrationPreview {
  const existingIds = new Set(existingTasks.map((task) => task.id));
  const existingKeys = new Set(existingTasks.map(taskMigrationKey));
  const seen = new Set<string>();
  const rows = localTasks.map((task) => {
    const key = taskMigrationKey(task);
    const localRemoteId = normalizePart(task.remoteId);
    let disposition: TaskMigrationDisposition = "migratable";
    if (!normalizePart(task.title) || normalizeTaskStatus(task.status) === "unknown" || !isCalendarDateOrEmpty(task.dueDate) || taskHasInvalidLinks(task)) {
      disposition = "invalid";
    } else if ((localRemoteId && existingIds.has(localRemoteId)) || (isUuid(task.id) && existingIds.has(task.id)) || existingKeys.has(key) || seen.has(key)) {
      disposition = "duplicate";
    } else if (!normalizedLink(task.tenantId)) {
      // Ordinary tasks remain migratable, but they can never unblock or block
      // a specific tenant's attachment cleanup.
      disposition = "unlinked";
    }
    seen.add(key);
    return { key, task, disposition };
  });
  const migratable = rows.filter((row) => row.disposition === "migratable").length;
  const unlinked = rows.filter((row) => row.disposition === "unlinked").length;
  return {
    total: rows.length,
    migratable,
    unlinked,
    readyToMigrate: migratable + unlinked,
    duplicate: rows.filter((row) => row.disposition === "duplicate").length,
    invalid: rows.filter((row) => row.disposition === "invalid").length,
    rows
  };
}

export function isCalendarDateOrEmpty(value: unknown) {
  return !normalizePart(value) || isCalendarDate(value);
}

export function normalizeTaskForServer(task: LocalTaskLike): Omit<ServerTaskLike, "id" | "createdAt" | "updatedAt"> | null {
  const status = normalizeTaskStatus(task.status || "pending");
  const title = normalizePart(task.title);
  if (!title || status === "unknown" || !isCalendarDateOrEmpty(task.dueDate) || taskHasInvalidLinks(task)) return null;
  return {
    taskType: normalizePart(task.taskType || "manual") || "manual",
    title,
    description: normalizePart(task.description),
    dueDate: normalizePart(task.dueDate),
    status,
    priority: normalizePart(task.priority || "normal") || "normal",
    notes: normalizePart(task.notes),
    tenantId: normalizedLink(task.tenantId),
    contractId: normalizedLink(task.contractId),
    roomId: normalizedLink(task.roomId),
    propertyId: normalizedLink(task.propertyId),
    remoteId: normalizePart(task.remoteId)
  };
}
