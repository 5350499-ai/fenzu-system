"use client";

import { getValidSupabaseSession } from "@/lib/supabase";
import {
  TASKS_SERVER_SYNC_ENABLED,
  type LocalTaskLike,
  type ServerTaskLike,
  type TaskMigrationPreview
} from "@/lib/task-management";

const localTaskKey = "v1-tasks";
const localTaskBackupKey = "v1-tasks:server-migration-backup";
const localTaskMigrationStateKey = "v1-tasks:server-migration-state";
const localTaskRemoteIdsKey = "v1-tasks:server-id-map";

export type TaskMigrationPreviewResponse = TaskMigrationPreview & { token: string; expiresAt: number };
export type TaskMigrationExecutionResponse = {
  created: number;
  duplicate: number;
  skipped: number;
  failed: number;
  results: Array<{ localId: string; status: "created" | "duplicate" | "skipped" | "failed"; serverId?: string }>;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export function readLegacyLocalTasks(): LocalTaskLike[] {
  const rows = readJson<unknown[]>(localTaskKey, []);
  return rows.filter((row): row is LocalTaskLike => Boolean(row && typeof row === "object"));
}

export function readTaskRemoteIdMap() {
  return readJson<Record<string, string>>(localTaskRemoteIdsKey, {});
}

export function buildLocalMigrationRows() {
  const remoteIds = readTaskRemoteIdMap();
  return readLegacyLocalTasks().map((task) => ({ ...task, remoteId: task.id ? remoteIds[task.id] || task.remoteId : task.remoteId }));
}

export function recordTaskMigrationResult(localTasks: LocalTaskLike[], response: TaskMigrationExecutionResponse) {
  const map = readTaskRemoteIdMap();
  for (const result of response.results) {
    if (result.localId && result.serverId) map[result.localId] = result.serverId;
  }
  // Retain a full immutable local backup; the original v1-tasks value is never
  // deleted or rewritten by migration completion.
  if (!window.localStorage.getItem(localTaskBackupKey)) writeJson(localTaskBackupKey, localTasks);
  writeJson(localTaskRemoteIdsKey, map);
  writeJson(localTaskMigrationStateKey, {
    completedAt: new Date().toISOString(),
    created: response.created,
    duplicate: response.duplicate,
    skipped: response.skipped,
    failed: response.failed
  });
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  let session = await getValidSupabaseSession();
  if (!session) throw new Error("登录状态已失效，请重新登录。");
  const send = (token: string) => fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  let response = await send(session.access_token);
  if (response.status === 401) {
    session = await getValidSupabaseSession(true);
    if (!session) throw new Error("登录状态已失效，请重新登录。");
    response = await send(session.access_token);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "操作失败，请稍后重试。");
  }
  return response;
}

export const serverTaskRepository = {
  enabled: TASKS_SERVER_SYNC_ENABLED,
  async listTasks() {
    const response = await authorizedFetch("/api/tasks/server", { cache: "no-store" });
    const payload = await response.json() as { rows?: ServerTaskLike[] };
    return payload.rows || [];
  },
  async createTask(task: LocalTaskLike) {
    const response = await authorizedFetch("/api/tasks/server", { method: "POST", body: JSON.stringify({ task }) });
    return (await response.json() as { task: ServerTaskLike }).task;
  },
  async updateTask(id: string, patch: Partial<LocalTaskLike>) {
    const response = await authorizedFetch("/api/tasks/server", { method: "PATCH", body: JSON.stringify({ id, patch }) });
    return (await response.json() as { task: ServerTaskLike }).task;
  },
  async completeTask(id: string) {
    const response = await authorizedFetch("/api/tasks/server", { method: "PATCH", body: JSON.stringify({ id, intent: "complete" }) });
    return (await response.json() as { task: ServerTaskLike }).task;
  },
  async cancelTask(id: string) {
    const response = await authorizedFetch("/api/tasks/server", { method: "PATCH", body: JSON.stringify({ id, intent: "cancel" }) });
    return (await response.json() as { task: ServerTaskLike }).task;
  },
  async deleteTask(id: string) {
    await authorizedFetch(`/api/tasks/server?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async previewMigration(tasks: LocalTaskLike[]) {
    const response = await authorizedFetch("/api/tasks/migration-preview", { method: "POST", body: JSON.stringify({ tasks }) });
    return await response.json() as TaskMigrationPreviewResponse;
  },
  async executeMigration(tasks: LocalTaskLike[], previewToken: string) {
    const response = await authorizedFetch("/api/tasks/migration", { method: "POST", body: JSON.stringify({ tasks, previewToken, confirmed: true }) });
    return await response.json() as TaskMigrationExecutionResponse;
  }
};
