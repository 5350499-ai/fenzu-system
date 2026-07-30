export const TASKS_SERVER_SYNC_ENABLED = false as const;

export type TaskStatus = "pending" | "completed" | "cancelled" | "unknown";

export type LocalTaskLike = {
  id?: string;
  title?: string;
  description?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  notes?: string;
  tenantId?: string;
  contractId?: string;
  roomId?: string;
};

export type ServerTaskLike = LocalTaskLike & { id: string };

export function normalizeTaskStatus(value: unknown): TaskStatus {
  const status = String(value || "").trim().toLowerCase();
  if (["pending", "待处理", "待办", "未完成"].includes(status)) return "pending";
  if (["completed", "complete", "已完成", "完成"].includes(status)) return "completed";
  if (["cancelled", "canceled", "已取消", "取消"].includes(status)) return "cancelled";
  return "unknown";
}

export function taskBlocksCleanup(task: Pick<LocalTaskLike, "status" | "tenantId">, tenantId: string) {
  return Boolean(task.tenantId === tenantId && normalizeTaskStatus(task.status) === "pending");
}

function normalizePart(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function taskMigrationKey(task: LocalTaskLike) {
  return [
    normalizePart(task.title),
    normalizePart(task.description),
    normalizePart(task.dueDate),
    normalizeTaskStatus(task.status),
    normalizePart(task.priority),
    normalizePart(task.notes),
    normalizePart(task.tenantId),
    normalizePart(task.contractId),
    normalizePart(task.roomId)
  ].join("|");
}

export type TaskMigrationPreview = {
  total: number;
  migratable: number;
  unlinked: number;
  duplicate: number;
  invalid: number;
  rows: Array<{ key: string; task: LocalTaskLike; disposition: "migratable" | "unlinked" | "duplicate" | "invalid" }>;
};

export function buildTaskMigrationPreview(localTasks: LocalTaskLike[], existingTasks: ServerTaskLike[] = []): TaskMigrationPreview {
  const existingKeys = new Set(existingTasks.map(taskMigrationKey));
  const seen = new Set<string>();
  const rows = localTasks.map((task) => {
    const key = taskMigrationKey(task);
    let disposition: TaskMigrationPreview["rows"][number]["disposition"] = "migratable";
    if (!normalizePart(task.title)) disposition = "invalid";
    else if (existingKeys.has(key) || seen.has(key)) disposition = "duplicate";
    else if (normalizeTaskStatus(task.status) === "unknown") disposition = "invalid";
    else if (!normalizePart(task.tenantId)) disposition = "unlinked";
    seen.add(key);
    return { key, task, disposition };
  });
  return {
    total: rows.length,
    migratable: rows.filter((row) => row.disposition === "migratable").length,
    unlinked: rows.filter((row) => row.disposition === "unlinked").length,
    duplicate: rows.filter((row) => row.disposition === "duplicate").length,
    invalid: rows.filter((row) => row.disposition === "invalid").length,
    rows
  };
}
