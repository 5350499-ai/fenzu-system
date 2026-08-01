import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { calendarCutoffDate, isContractCurrentlyActive, localCalendarDate } from "@/lib/attachment-management-rules";
import { ATTACHMENT_CLEANUP_EXECUTION_ENABLED, cleanupSkipReasonLabel, evaluateCleanupCandidate, isCleanupPreviewWindowValid, type CleanupDepositState, type CleanupRoomState, type CleanupTaskState } from "@/lib/attachment-cleanup-rules";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadAttachmentManagementTenants } from "@/lib/server/attachment-management";
import { loadServerTasks } from "@/lib/server/task-management";
import { AccountApiError } from "@/lib/server/account-auth";
import { TASKS_SERVER_SYNC_ENABLED, normalizeTaskStatus } from "@/lib/task-management";

type CleanupAttachmentTable = "contract_files" | "rent_payment_files";

type AttachmentRow = {
  id: string;
  storage_provider: string | null;
  file_size: number | null;
  contract_id?: string | null;
  rent_payment_id?: string | null;
};

type TenantRow = {
  id: string;
  name: string;
  room_id: string | null;
  property_id: string | null;
  status: string | null;
  actual_move_out_date?: string | null;
};

type ContractRow = { id: string; tenant_id: string | null; status: string | null; end_date: string | null };
type PaymentRow = { id: string; tenant_id: string | null };
type DepositRow = { tenant_id: string | null; status: string | null; notes: string | null };
type RoomRow = { id: string; name: string | null; room_number: string | null };

export type AttachmentCleanupTenantPreview = {
  tenantId: string;
  tenantName: string;
  room: string;
  actualMoveOutDate: string | null;
  contractCount: number;
  contractBytes: number;
  rentPaymentCount: number;
  rentPaymentBytes: number;
  attachmentCount: number;
  bytes: number;
  skipReason: string | null;
};

export type AttachmentCleanupPreview = {
  thresholdMonths: 3 | 6;
  generatedAt: string;
  candidateTenantCount: number;
  candidateAttachmentCount: number;
  candidateTotalBytes: number;
  candidates: AttachmentCleanupTenantPreview[];
  skipped: AttachmentCleanupTenantPreview[];
  riskNotices: string[];
  previewToken: string;
  executionEnabled: false;
};

type PreviewTokenPayload = { workspaceOwnerId: string; thresholdMonths: 3 | 6; expiresAt: number; nonce: string };

const previewTokenLifetimeMs = 10 * 60 * 1000;

function toBytes(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isVoidedDeposit(notes: string | null) {
  return Boolean(notes?.includes("[已作废") || notes?.includes("[作废"));
}

function isMovedOut(status: string | null) {
  return status === "已退租";
}

function isDepositProcessed(deposits: DepositRow[]): CleanupDepositState {
  const valid = deposits.filter((deposit) => !isVoidedDeposit(deposit.notes));
  if (!valid.length) return "unknown";
  return valid.every((deposit) => deposit.status === "已退") ? "complete" : "incomplete";
}

function roomStateForTenant(tenant: TenantRow, hasActiveContract: boolean): CleanupRoomState {
  if (!tenant.room_id) return "unknown";
  if (!isMovedOut(tenant.status) || hasActiveContract) return "occupied";
  return "released";
}

function assertThreshold(value: number): asserts value is 3 | 6 {
  if (value !== 3 && value !== 6) throw new AccountApiError("仅支持3个月或6个月清理预览。", 400);
}

function signPayload(accessToken: string, payload: PreviewTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", accessToken).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function createAttachmentCleanupPreviewToken(accessToken: string, workspaceOwnerId: string, thresholdMonths: 3 | 6) {
  return signPayload(accessToken, { workspaceOwnerId, thresholdMonths, expiresAt: Date.now() + previewTokenLifetimeMs, nonce: randomUUID() });
}

export function verifyAttachmentCleanupPreviewToken(accessToken: string, token: string, workspaceOwnerId: string, thresholdMonths: 3 | 6) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = createHmac("sha256", accessToken).update(body).digest("base64url");
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewTokenPayload;
    return payload.workspaceOwnerId === workspaceOwnerId && payload.thresholdMonths === thresholdMonths && isCleanupPreviewWindowValid(payload.expiresAt);
  } catch {
    return false;
  }
}

async function query<T>(name: string, promise: PromiseLike<{ data: T | null; error: { message?: string } | null }>) {
  const result = await promise;
  if (result.error) {
    console.error("[attachment-cleanup-preview] query failed", { name, message: result.error.message?.slice(0, 160) });
    throw new AccountApiError("附件清理预览读取失败。", 500);
  }
  return result.data || [];
}

export async function loadAttachmentCleanupPreview(workspaceOwnerId: string, thresholdMonths: number, accessToken: string): Promise<AttachmentCleanupPreview> {
  assertThreshold(thresholdMonths);
  const admin = getSupabaseAdmin();
  const [tenants, contracts, payments, deposits, rooms, contractFiles, rentPaymentFiles] = await Promise.all([
    loadAttachmentManagementTenants(admin, workspaceOwnerId) as Promise<TenantRow[]>,
    query<ContractRow[]>("contracts", admin.from("contracts").select("id,tenant_id,status,end_date").eq("user_id", workspaceOwnerId)),
    query<PaymentRow[]>("rent_payments", admin.from("rent_payments").select("id,tenant_id").eq("user_id", workspaceOwnerId)),
    query<DepositRow[]>("deposits", admin.from("deposits").select("tenant_id,status,notes").eq("user_id", workspaceOwnerId)),
    query<RoomRow[]>("rooms", admin.from("rooms").select("id,name,room_number").eq("user_id", workspaceOwnerId)),
    query<AttachmentRow[]>("contract_files", admin.from("contract_files").select("id,storage_provider,file_size,contract_id").eq("user_id", workspaceOwnerId).eq("storage_provider", "supabase")),
    query<AttachmentRow[]>("rent_payment_files", admin.from("rent_payment_files").select("id,storage_provider,file_size,rent_payment_id").eq("user_id", workspaceOwnerId).eq("storage_provider", "supabase"))
  ]);

  const today = localCalendarDate(new Date());
  if (!today) throw new AccountApiError("无法确定当前本地日期。", 500);
  const cutoffDate = calendarCutoffDate(new Date(), thresholdMonths);
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const depositsByTenant = new Map<string, DepositRow[]>();
  for (const deposit of deposits) {
    if (!deposit.tenant_id) continue;
    depositsByTenant.set(deposit.tenant_id, [...(depositsByTenant.get(deposit.tenant_id) || []), deposit]);
  }
  const filesByTenant = new Map<string, Array<AttachmentRow & { table: CleanupAttachmentTable }>>();
  const addFile = (file: AttachmentRow, table: CleanupAttachmentTable, tenantId: string | null | undefined) => {
    if (!tenantId || file.storage_provider !== "supabase") return;
    const key = `${table}:${file.id}`;
    const existing = filesByTenant.get(tenantId) || [];
    if (existing.some((item) => `${item.table}:${item.id}` === key)) return;
    filesByTenant.set(tenantId, [...existing, { ...file, table }]);
  };
  for (const file of contractFiles) addFile(file, "contract_files", file.contract_id ? contractById.get(file.contract_id)?.tenant_id : null);
  for (const file of rentPaymentFiles) addFile(file, "rent_payment_files", file.rent_payment_id ? paymentById.get(file.rent_payment_id)?.tenant_id : null);

  const taskStateByTenant = new Map<string, CleanupTaskState>();
  let taskSourceUnavailable = !TASKS_SERVER_SYNC_ENABLED;
  if (TASKS_SERVER_SYNC_ENABLED) {
    const serverTasks = await loadServerTasks(workspaceOwnerId, accessToken);
    if (serverTasks.available) {
      for (const tenant of tenants) {
        const pending = serverTasks.rows.some((task) => task.tenantId === tenant.id && normalizeTaskStatus(task.status) === "pending");
        taskStateByTenant.set(tenant.id, pending ? "pending" : "clear");
      }
    } else {
      taskSourceUnavailable = true;
    }
  }
  const rows = tenants.flatMap((tenant) => {
    const files = filesByTenant.get(tenant.id) || [];
    if (!files.length) return [];
    const hasActiveContract = contracts.some((contract) => contract.tenant_id === tenant.id && isContractCurrentlyActive({ status: contract.status, isActive: null, endDate: contract.end_date }, today));
    const decision = evaluateCleanupCandidate({
      actualMoveOutDate: tenant.actual_move_out_date || null,
      movedOut: isMovedOut(tenant.status),
      hasActiveContract,
      depositState: isDepositProcessed(depositsByTenant.get(tenant.id) || []),
      // A disabled or unavailable server task source remains unknown. Local
      // browser state is never treated as proof that cleanup is safe.
      taskState: taskStateByTenant.get(tenant.id) || (taskSourceUnavailable ? "unavailable" : "unknown"),
      roomState: roomStateForTenant(tenant, hasActiveContract)
    }, cutoffDate);
    const contractFilesForTenant = files.filter((file) => file.table === "contract_files");
    const rentFilesForTenant = files.filter((file) => file.table === "rent_payment_files");
    const roomRow = tenant.room_id ? roomById.get(tenant.room_id) : null;
    return [{
      tenantId: tenant.id,
      tenantName: tenant.name,
      room: roomRow?.name || roomRow?.room_number || "未关联房间",
      actualMoveOutDate: tenant.actual_move_out_date || null,
      contractCount: contractFilesForTenant.length,
      contractBytes: contractFilesForTenant.reduce((sum, file) => sum + toBytes(file.file_size), 0),
      rentPaymentCount: rentFilesForTenant.length,
      rentPaymentBytes: rentFilesForTenant.reduce((sum, file) => sum + toBytes(file.file_size), 0),
      attachmentCount: files.length,
      bytes: files.reduce((sum, file) => sum + toBytes(file.file_size), 0),
      skipReason: decision.eligible ? null : cleanupSkipReasonLabel(decision.reason)
    } satisfies AttachmentCleanupTenantPreview];
  });
  const candidates = rows.filter((row) => !row.skipReason);
  const skipped = rows.filter((row) => Boolean(row.skipReason));
  return {
    thresholdMonths,
    generatedAt: new Date().toISOString(),
    candidateTenantCount: candidates.length,
    candidateAttachmentCount: candidates.reduce((sum, row) => sum + row.attachmentCount, 0),
    candidateTotalBytes: candidates.reduce((sum, row) => sum + row.bytes, 0),
    candidates,
    skipped,
    riskNotices: [
      "仅统计 Supabase 合同附件和收款附件；支出附件与 Google Drive 历史附件均已排除。",
      "当前待办事项使用浏览器本地存储，服务端无法可靠核验未完成待办；因此本次预览按安全规则跳过所有相关租客。",
      "执行清理与 ZIP 归档功能在此版本中均默认关闭，未进行任何文件或索引写操作。"
    ],
    previewToken: createAttachmentCleanupPreviewToken(accessToken, workspaceOwnerId, thresholdMonths),
    executionEnabled: ATTACHMENT_CLEANUP_EXECUTION_ENABLED
  };
}

/** Deliberately inert execution boundary for a separately authorized rollout. */
export async function runAttachmentCleanupSkeleton(input: { previewToken?: string; thresholdMonths?: number }) {
  void input;
  throw new AccountApiError("附件清理执行功能尚未启用。", 403);
}
