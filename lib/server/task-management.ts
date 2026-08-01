import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { AccountApiError, requireModulePermission, requirePropertyAccess, type AccountRequestContext } from "@/lib/server/account-auth";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import {
  TASKS_SERVER_SYNC_ENABLED,
  buildTaskMigrationPreview,
  isUuid,
  normalizeTaskForServer,
  normalizeTaskStatus,
  taskMigrationKey,
  type LocalTaskLike,
  type ServerTaskLike,
  type TaskMigrationPreview,
  type TaskStatus
} from "@/lib/task-management";

type TaskRow = {
  id: string;
  task_type: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string | null;
  notes: string | null;
  property_id: string | null;
  room_id: string | null;
  tenant_id: string | null;
  contract_id: string | null;
  rent_payment_id: string | null;
  deposit_id: string | null;
  created_at: string;
  updated_at: string;
};

const taskSelect = "id,task_type,title,description,due_date,status,priority,notes,property_id,room_id,tenant_id,contract_id,rent_payment_id,deposit_id,created_at,updated_at";
const previewLifetimeMs = 10 * 60 * 1000;

export type ServerTaskLoadResult = {
  enabled: boolean;
  available: boolean;
  rows: ServerTaskLike[];
  reason: "disabled" | "ready" | "query_failed";
};

export type TaskMigrationPreviewResult = TaskMigrationPreview & {
  token: string;
  expiresAt: number;
};

export type TaskMigrationItemResult = {
  localId: string;
  status: "created" | "duplicate" | "skipped" | "failed";
  serverId?: string;
};

function trimText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function nullableText(value: unknown, maxLength: number) {
  const result = trimText(value, maxLength);
  return result || null;
}

function toServerTask(row: TaskRow): ServerTaskLike {
  const status = normalizeTaskStatus(row.status);
  return {
    id: row.id,
    taskType: row.task_type || "manual",
    title: row.title || "",
    description: row.description || "",
    dueDate: row.due_date || "",
    status: status === "unknown" ? "pending" : status,
    priority: row.priority || "normal",
    notes: row.notes || "",
    propertyId: row.property_id || "",
    roomId: row.room_id || "",
    tenantId: row.tenant_id || "",
    contractId: row.contract_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function canonicalRows(tasks: LocalTaskLike[]) {
  return tasks.map((task) => ({
    id: isUuid(task.id) ? task.id : "",
    remoteId: isUuid(task.remoteId) ? task.remoteId : "",
    key: taskMigrationKey(task)
  })).sort((left, right) => `${left.id}|${left.remoteId}|${left.key}`.localeCompare(`${right.id}|${right.remoteId}|${right.key}`));
}

function migrationHash(tasks: LocalTaskLike[]) {
  return createHash("sha256").update(JSON.stringify(canonicalRows(tasks))).digest("base64url");
}

function signMigrationPayload(accessToken: string, payload: { workspaceOwnerId: string; hash: string; expiresAt: number }) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", accessToken).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyMigrationPayload(accessToken: string, token: string, workspaceOwnerId: string, tasks: LocalTaskLike[]) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new AccountApiError("迁移预览已失效，请重新生成预览。", 400);
  const expected = createHmac("sha256", accessToken).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new AccountApiError("迁移预览校验失败，请重新生成预览。", 400);
  }
  let payload: { workspaceOwnerId?: string; hash?: string; expiresAt?: number };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new AccountApiError("迁移预览校验失败，请重新生成预览。", 400);
  }
  if (payload.workspaceOwnerId !== workspaceOwnerId || payload.hash !== migrationHash(tasks) || !Number.isFinite(payload.expiresAt) || Number(payload.expiresAt) < Date.now()) {
    throw new AccountApiError("迁移预览已过期或内容已变更，请重新生成预览。", 400);
  }
}

async function queryTaskRows(context: AccountRequestContext) {
  const client = getSupabaseAuthVerifier(context.accessToken);
  const { data, error } = await client
    .from("tasks")
    .select(taskSelect)
    .eq("user_id", context.profile.workspace_owner_id)
    .order("created_at", { ascending: false });
  if (error) throw new AccountApiError("读取待办失败，请稍后重试。", error.code === "42501" ? 403 : 500);
  return ((data || []) as TaskRow[]).map(toServerTask);
}

export async function loadServerTasksForContext(context: AccountRequestContext) {
  return queryTaskRows(context);
}

export async function loadServerTasks(workspaceOwnerId: string, accessToken?: string): Promise<ServerTaskLoadResult> {
  if (!TASKS_SERVER_SYNC_ENABLED) return { enabled: false, available: false, rows: [], reason: "disabled" };
  if (!accessToken) return { enabled: true, available: false, rows: [], reason: "query_failed" };
  try {
    // This compatibility helper is intentionally used only by already-authenticated
    // request paths.  Cleanup passes its verified access token as well.
    const client = getSupabaseAuthVerifier(accessToken);
    const { data, error } = await client.from("tasks").select(taskSelect).eq("user_id", workspaceOwnerId).order("created_at", { ascending: false });
    if (error) return { enabled: true, available: false, rows: [], reason: "query_failed" };
    return { enabled: true, available: true, rows: ((data || []) as TaskRow[]).map(toServerTask), reason: "ready" };
  } catch {
    return { enabled: true, available: false, rows: [], reason: "query_failed" };
  }
}

type Association = { table: "properties" | "rooms" | "tenants" | "contracts" | "rent_payments" | "deposits"; id: string; propertyId: string | null; roomId?: string | null; tenantId?: string | null };

async function resolveAssociation(context: AccountRequestContext, table: Association["table"], id: string): Promise<Association> {
  const client = getSupabaseAuthVerifier(context.accessToken);
  const select = table === "properties" ? "id" : table === "rooms" ? "id,property_id" : "id,property_id,room_id,tenant_id";
  // Relationship table names are selected from a closed server-side union.
  // supabase-js's generated parser cannot infer a dynamic select string here.
  const { data, error } = await (client as any).from(table).select(select).eq("id", id).maybeSingle();
  if (error) throw new AccountApiError("关联记录校验失败，请稍后重试。", error.code === "42501" ? 403 : 500);
  if (!data) throw new AccountApiError("关联记录不存在或无权访问。", 404);
  const row = data as Record<string, unknown>;
  return {
    table,
    id,
    propertyId: table === "properties" ? id : (row.property_id == null ? null : String(row.property_id)),
    roomId: row.room_id == null ? null : String(row.room_id),
    tenantId: row.tenant_id == null ? null : String(row.tenant_id)
  };
}

type TaskPatch = {
  id?: string;
  taskType?: string;
  title?: string;
  description?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  notes?: string;
  propertyId?: string;
  roomId?: string;
  tenantId?: string;
  contractId?: string;
};

function readTaskPatch(value: unknown, partial = false): TaskPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccountApiError("待办数据格式不正确。", 400);
  const source = value as Record<string, unknown>;
  const allowed = ["id", "taskType", "title", "description", "dueDate", "status", "priority", "notes", "propertyId", "roomId", "tenantId", "contractId"] as const;
  const patch: TaskPatch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) patch[key] = typeof source[key] === "string" ? source[key] : "";
  }
  if (partial && Object.keys(patch).filter((key) => key !== "id").length === 0) throw new AccountApiError("没有可修改的待办字段。", 400);
  return patch;
}

function linkValue(value: string | undefined, label: string) {
  const normalized = String(value || "").trim();
  if (normalized && !isUuid(normalized)) throw new AccountApiError(`${label}格式不正确。`, 400);
  return normalized || null;
}

async function buildTaskRow(context: AccountRequestContext, patch: TaskPatch, existing?: ServerTaskLike) {
  const merged: TaskPatch = {
    taskType: existing?.taskType,
    title: existing?.title,
    description: existing?.description,
    dueDate: existing?.dueDate,
    status: existing?.status,
    priority: existing?.priority,
    notes: existing?.notes,
    propertyId: existing?.propertyId,
    roomId: existing?.roomId,
    tenantId: existing?.tenantId,
    contractId: existing?.contractId,
    ...patch
  };
  const normalized = normalizeTaskForServer(merged);
  if (!normalized) throw new AccountApiError("待办标题、状态、日期或关联信息不正确。", 400);

  const suppliedProperty = linkValue(normalized.propertyId, "房源");
  const suppliedRoom = linkValue(normalized.roomId, "房间");
  const suppliedTenant = linkValue(normalized.tenantId, "租客");
  const suppliedContract = linkValue(normalized.contractId, "合同");
  const associations = await Promise.all([
    suppliedProperty ? resolveAssociation(context, "properties", suppliedProperty) : null,
    suppliedRoom ? resolveAssociation(context, "rooms", suppliedRoom) : null,
    suppliedTenant ? resolveAssociation(context, "tenants", suppliedTenant) : null,
    suppliedContract ? resolveAssociation(context, "contracts", suppliedContract) : null
  ]);
  const [property, room, tenant, contract] = associations;
  const propertyId = tenant?.propertyId || contract?.propertyId || room?.propertyId || property?.propertyId || null;
  const roomId = tenant?.roomId || contract?.roomId || room?.id || null;
  const tenantId = contract?.tenantId || tenant?.id || null;

  for (const expected of [property?.propertyId, room?.propertyId, tenant?.propertyId, contract?.propertyId]) {
    if (expected && propertyId && expected !== propertyId) throw new AccountApiError("关联的房源信息不一致。", 400);
  }
  for (const expected of [tenant?.roomId, contract?.roomId]) {
    if (expected && roomId && expected !== roomId) throw new AccountApiError("关联的房间信息不一致。", 400);
  }
  if (contract?.tenantId && tenantId && contract.tenantId !== tenantId) throw new AccountApiError("关联的租客信息不一致。", 400);

  if (propertyId) await requirePropertyAccess(context, propertyId);
  else if (context.profile.account_type !== "owner") throw new AccountApiError("普通待办需要关联一个已授权房源。", 403);

  return {
    task_type: trimText(normalized.taskType, 64) || "manual",
    title: trimText(normalized.title, 200),
    description: nullableText(normalized.description, 4_000),
    due_date: normalized.dueDate || null,
    status: normalized.status as Exclude<TaskStatus, "unknown">,
    priority: trimText(normalized.priority, 32) || "normal",
    notes: nullableText(normalized.notes, 4_000),
    property_id: propertyId,
    room_id: roomId,
    tenant_id: tenantId,
    contract_id: contract?.id || null
  };
}

async function findTask(context: AccountRequestContext, id: string) {
  if (!isUuid(id)) throw new AccountApiError("待办ID格式不正确。", 400);
  const client = getSupabaseAuthVerifier(context.accessToken);
  const { data, error } = await client.from("tasks").select(taskSelect).eq("id", id).eq("user_id", context.profile.workspace_owner_id).maybeSingle();
  if (error) throw new AccountApiError("读取待办失败，请稍后重试。", error.code === "42501" ? 403 : 500);
  if (!data) throw new AccountApiError("待办不存在或无权访问。", 404);
  return toServerTask(data as TaskRow);
}

export async function createServerTask(context: AccountRequestContext, input: unknown) {
  await requireModulePermission(context, "tasks", "create");
  const patch = readTaskPatch(input);
  const requestedId = linkValue(patch.id, "请求ID") || randomUUID();
  const row = await buildTaskRow(context, patch);
  const client = getSupabaseAuthVerifier(context.accessToken);
  const { data, error } = await client.from("tasks").insert({ id: requestedId, user_id: context.profile.workspace_owner_id, ...row }).select(taskSelect).maybeSingle();
  if (!error && data) return { task: toServerTask(data as TaskRow), idempotent: false };
  if (error?.code === "23505") {
    const existing = await findTask(context, requestedId);
    // Compare against the fully resolved row. A local task may provide only a
    // tenant ID, while the server deterministically derives its room/property.
    // Comparing the raw request would incorrectly turn a safe retry into 409.
    const expected = taskMigrationKey({
      id: requestedId,
      taskType: row.task_type,
      title: row.title,
      description: row.description || "",
      dueDate: row.due_date || "",
      status: row.status,
      priority: row.priority,
      notes: row.notes || "",
      propertyId: row.property_id || "",
      roomId: row.room_id || "",
      tenantId: row.tenant_id || "",
      contractId: row.contract_id || ""
    });
    if (taskMigrationKey(existing) === expected) return { task: existing, idempotent: true };
    throw new AccountApiError("请求ID已被其他待办使用，请刷新后重试。", 409);
  }
  throw new AccountApiError(error?.code === "42501" ? "没有权限创建待办。" : "创建待办失败，请稍后重试。", error?.code === "42501" ? 403 : 500);
}

export async function updateServerTask(context: AccountRequestContext, id: string, input: unknown) {
  await requireModulePermission(context, "tasks", "edit");
  const existing = await findTask(context, id);
  const patch = readTaskPatch(input, true);
  const row = await buildTaskRow(context, patch, existing);
  const client = getSupabaseAuthVerifier(context.accessToken);
  const { data, error } = await client.from("tasks").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", context.profile.workspace_owner_id).select(taskSelect).maybeSingle();
  if (error) throw new AccountApiError(error.code === "42501" ? "没有权限修改待办。" : "保存待办失败，请稍后重试。", error.code === "42501" ? 403 : 500);
  if (!data) throw new AccountApiError("待办不存在或无权访问。", 404);
  return toServerTask(data as TaskRow);
}

export async function deleteServerTask(context: AccountRequestContext, id: string) {
  await requireModulePermission(context, "tasks", "delete");
  await findTask(context, id);
  const client = getSupabaseAuthVerifier(context.accessToken);
  const { data, error } = await client.from("tasks").delete().eq("id", id).eq("user_id", context.profile.workspace_owner_id).select("id");
  if (error) throw new AccountApiError(error.code === "42501" ? "没有权限删除待办。" : "删除待办失败，请稍后重试。", error.code === "42501" ? 403 : 500);
  if (!data?.length) throw new AccountApiError("待办不存在或无权访问。", 404);
}

export async function buildServerTaskMigrationPreview(context: AccountRequestContext, tasks: LocalTaskLike[]): Promise<TaskMigrationPreviewResult> {
  const existingTasks = await queryTaskRows(context);
  const preview = buildTaskMigrationPreview(tasks, existingTasks);
  const expiresAt = Date.now() + previewLifetimeMs;
  return {
    ...preview,
    token: signMigrationPayload(context.accessToken, { workspaceOwnerId: context.profile.workspace_owner_id, hash: migrationHash(tasks), expiresAt }),
    expiresAt
  };
}

export async function migrateLocalTasks(context: AccountRequestContext, tasks: LocalTaskLike[], token: string) {
  await requireModulePermission(context, "tasks", "create");
  verifyMigrationPayload(context.accessToken, token, context.profile.workspace_owner_id, tasks);
  const existing = await queryTaskRows(context);
  const existingIds = new Set(existing.map((task) => task.id));
  const existingKeys = new Set(existing.map(taskMigrationKey));
  const results: TaskMigrationItemResult[] = [];

  for (const task of tasks) {
    const localId = String(task.id || "");
    const normalized = normalizeTaskForServer(task);
    if (!normalized) {
      results.push({ localId, status: "skipped" });
      continue;
    }
    const remoteId = isUuid(task.remoteId) ? task.remoteId : isUuid(task.id) ? task.id : null;
    const key = taskMigrationKey(task);
    const duplicate = (remoteId && existingIds.has(remoteId)) || existingKeys.has(key);
    if (duplicate) {
      const matched = existing.find((item) => item.id === remoteId || taskMigrationKey(item) === key);
      results.push({ localId, status: "duplicate", ...(matched ? { serverId: matched.id } : {}) });
      continue;
    }
    try {
      const created = await createServerTask(context, { ...normalized, ...(isUuid(task.id) ? { id: task.id } : {}) });
      existing.push(created.task);
      existingIds.add(created.task.id);
      existingKeys.add(taskMigrationKey(created.task));
      results.push({ localId, status: created.idempotent ? "duplicate" : "created", serverId: created.task.id });
    } catch {
      // Deliberately do not expose database diagnostics or association IDs.
      results.push({ localId, status: "failed" });
    }
  }
  return {
    created: results.filter((item) => item.status === "created").length,
    duplicate: results.filter((item) => item.status === "duplicate").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
    results
  };
}
