import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { AccountApiError } from "@/lib/server/account-auth";
import { getGoogleAccessToken, getGoogleDriveAttachmentMetadata, getGoogleDriveContent, GoogleDriveAccessError } from "@/lib/server/google-drive";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildGoogleMigrationTargetPath, migrationTableSelect, sha256Hex } from "@/lib/google-attachment-migration-rules";

export type MigrationTable = "contract_files" | "rent_payment_files" | "expense_files";
export type MigrationStatus = "readable" | "missing" | "trashed" | "permission_denied" | "authorization_error" | "metadata_mismatch" | "duplicate" | "outside_root" | "target_conflict" | "target_exists" | "scan_failed";
export type MigrationRunItemStatus = "migrated" | "already_migrated" | "failed" | "skipped" | "conflict";

type SourceRow = {
  id: string;
  user_id: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | string | null;
  storage_provider: string | null;
  provider_file_id: string | null;
  contract_id?: string | null;
  rent_payment_id?: string | null;
  expense_id?: string | null;
};

export type MigrationScanItem = {
  attachmentId: string;
  table: MigrationTable;
  parentRecordId: string | null;
  fileName: string;
  databaseMime: string | null;
  databaseSize: number;
  sourceStatus: MigrationStatus;
  driveMime: string | null;
  driveSize: number | null;
  targetBucket: string;
  targetPath: string;
  targetStatus: "unknown" | "available" | "exists" | "conflict";
  readable: boolean;
  migratable: boolean;
  reason: string | null;
  providerFingerprint: string | null;
};

export type MigrationScanResult = {
  scannedAt: string;
  expiresAt: string;
  items: MigrationScanItem[];
  summary: {
    total: number;
    readable: number;
    migratable: number;
    alreadyMigrated: number;
    missing: number;
    trashed: number;
    permissionDenied: number;
    authorizationFailures: number;
    authorizationError: string | null;
    duplicates: number;
    metadataMismatch: number;
    outsideRoot: number;
    targetConflicts: number;
    totalBytes: number;
  };
  previewToken: string;
};

const tableConfig: Record<MigrationTable, { bucket: string; parentKey: "contract_id" | "rent_payment_id" | "expense_id" }> = {
  contract_files: { bucket: "contract-files", parentKey: "contract_id" },
  rent_payment_files: { bucket: "rent-payment-files", parentKey: "rent_payment_id" },
  expense_files: { bucket: "expense-files", parentKey: "expense_id" }
};

function normalizeSize(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function fingerprint(value: string) {
  return createHmac("sha256", migrationSecret()).update(value).digest("hex").slice(0, 12);
}

function migrationSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new AccountApiError("迁移服务尚未配置。", 503);
  return secret;
}

function signPreview(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", migrationSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function scanTargetDigest(items: Pick<MigrationScanItem, "attachmentId" | "targetBucket" | "targetPath">[]) {
  return fingerprint(items.map((item) => `${item.attachmentId}:${item.targetBucket}:${item.targetPath}`).join("|"));
}

export function verifyMigrationPreviewToken(token: string, context: { userId: string; workspaceId: string }) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new AccountApiError("迁移预览令牌无效或已过期。", 400);
  const expected = createHmac("sha256", migrationSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AccountApiError("迁移预览令牌无效或已过期。", 400);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>; } catch { throw new AccountApiError("迁移预览令牌无效或已过期。", 400); }
  if (payload.userId !== context.userId || payload.workspaceId !== context.workspaceId || typeof payload.expiresAt !== "string" || new Date(payload.expiresAt).getTime() <= Date.now()) {
    throw new AccountApiError("迁移预览令牌无效或已过期。", 400);
  }
  return payload;
}

async function targetState(bucket: string, path: string) {
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await getSupabaseAdmin().storage.from(bucket).list(directory, { limit: 100, search: name });
  if (error) return "unknown" as const;
  const match = (data || []).find((entry) => entry.name === name);
  return match ? "exists" as const : "available" as const;
}

async function readRows(table: MigrationTable, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin().from(table).select(migrationTableSelect[table]).eq("user_id", workspaceId).eq("storage_provider", "google_drive");
  if (error) {
    const safeMessage = String(error.message || "query failed").replace(/(token|secret|cookie|authorization|service[_ -]?role|signed[_ -]?url)/gi, "[filtered]").slice(0, 240);
    console.error("google_attachment_migration_query_failed", { stage: "query_attachment_table", table, code: error.code || "unknown", message: safeMessage });
    throw new AccountApiError(`无法读取 ${table} 附件索引。`, 502);
  }
  console.info("google_attachment_migration_query_completed", { stage: "query_attachment_table", table, count: data?.length || 0 });
  return (data || []) as unknown as SourceRow[];
}

export async function scanGoogleAttachments(workspaceId: string, userId: string): Promise<MigrationScanResult> {
  const tables = Object.keys(tableConfig) as MigrationTable[];
  const rowsByTable = await Promise.all(tables.map(async (table) => [table, await readRows(table, workspaceId)] as const));
  const rows = rowsByTable.flatMap(([table, values]) => values.map((row) => ({ table, row })));
  let accessToken: string | null = null;
  let authorizationError: string | null = null;
  if (rows.length) {
    try { accessToken = await getGoogleAccessToken(); }
    catch (error) {
      authorizationError = error instanceof GoogleDriveAccessError ? error.category : "token_exchange_failed";
      console.error("google_attachment_migration_authorization_failed", { stage: "token_exchange", category: authorizationError });
    }
  }
  const duplicateIds = new Set<string>();
  const seen = new Map<string, number>();
  for (const { row } of rows) {
    if (!row.provider_file_id) continue;
    const next = (seen.get(row.provider_file_id) || 0) + 1;
    seen.set(row.provider_file_id, next);
    if (next > 1) duplicateIds.add(row.provider_file_id);
  }
  const items: MigrationScanItem[] = [];
  for (const { table, row } of rows) {
    const config = tableConfig[table];
    const fileName = row.file_name || "attachment";
    const databaseMime = row.file_type || null;
    const databaseSize = normalizeSize(row.file_size);
    const parentRecordId = row[config.parentKey] || null;
    const path = buildGoogleMigrationTargetPath(workspaceId, table, parentRecordId, row.id, fileName, databaseMime);
    let sourceStatus: MigrationStatus = "readable";
    let driveMime: string | null = null;
    let driveSize: number | null = null;
    let readable = false;
    let reason: string | null = null;
    let withinRoot = true;
    if (authorizationError) {
      sourceStatus = "authorization_error";
      reason = "Google Drive 授权不可用，请先修复服务端授权。";
    } else if (!row.provider_file_id) {
      sourceStatus = "scan_failed"; reason = "缺少 Google Drive 文件标识。";
    } else if (duplicateIds.has(row.provider_file_id)) {
      sourceStatus = "duplicate"; reason = "多个附件索引指向同一个 Google Drive 文件。";
    } else {
      try {
        const metadata = await getGoogleDriveAttachmentMetadata(row.provider_file_id, accessToken || undefined);
        driveMime = metadata.mimeType; driveSize = metadata.size; readable = metadata.downloadable; withinRoot = metadata.withinConfiguredRoot;
        if (metadata.trashed) { sourceStatus = "trashed"; reason = "Google Drive 文件在回收站。"; }
        else if (!metadata.downloadable) { sourceStatus = "permission_denied"; reason = "Google Drive 文件不可下载。"; }
        else if (!withinRoot) { sourceStatus = "outside_root"; reason = "文件不在配置的正式根目录内。"; }
        else if ((databaseMime && databaseMime !== driveMime) || databaseSize !== driveSize) { sourceStatus = "metadata_mismatch"; reason = "数据库记录与 Google Drive 元数据不一致。"; }
      } catch (error) {
        if (error instanceof GoogleDriveAccessError) {
          sourceStatus = error.category === "drive_api_not_found" ? "missing" : "permission_denied";
          reason = error.message;
        } else sourceStatus = error instanceof AccountApiError && error.status === 404 ? "missing" : "permission_denied";
        reason = sourceStatus === "missing" ? "按文件标识无法找到 Google Drive 文件。" : "无法读取 Google Drive 文件元数据。";
      }
    }
    const targetStatus = await targetState(config.bucket, path);
    if (targetStatus === "exists" && sourceStatus === "readable") { sourceStatus = "target_conflict"; reason = "目标路径已有对象，需要执行时校验内容后再决定。"; }
    const migratable = readable && sourceStatus === "readable" && targetStatus === "available";
    items.push({ attachmentId: row.id, table, parentRecordId, fileName, databaseMime, databaseSize, sourceStatus, driveMime, driveSize, targetBucket: config.bucket, targetPath: path, targetStatus, readable, migratable, reason, providerFingerprint: row.provider_file_id ? fingerprint(row.provider_file_id) : null });
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const summary = {
    total: items.length,
    readable: items.filter((item) => item.readable).length,
    migratable: items.filter((item) => item.migratable).length,
    alreadyMigrated: 0,
    missing: items.filter((item) => item.sourceStatus === "missing").length,
    trashed: items.filter((item) => item.sourceStatus === "trashed").length,
    permissionDenied: items.filter((item) => item.sourceStatus === "permission_denied").length,
    authorizationFailures: items.filter((item) => item.sourceStatus === "authorization_error").length,
    authorizationError,
    duplicates: items.filter((item) => item.sourceStatus === "duplicate").length,
    metadataMismatch: items.filter((item) => item.sourceStatus === "metadata_mismatch").length,
    outsideRoot: items.filter((item) => item.sourceStatus === "outside_root").length,
    targetConflicts: items.filter((item) => item.targetStatus === "conflict" || item.targetStatus === "exists").length,
    totalBytes: items.reduce((sum, item) => sum + (item.driveSize || item.databaseSize), 0)
  };
  const previewToken = signPreview({ userId, workspaceId, scannedAt: now.toISOString(), expiresAt, attachmentIds: items.map((item) => item.attachmentId), targetDigest: scanTargetDigest(items) });
  return { scannedAt: now.toISOString(), expiresAt, items, summary, previewToken };
}

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error || "unknown error")
    .replace(/(token|secret|cookie|authorization|service[_ -]?role|signed[_ -]?url)/gi, "[filtered]")
    .slice(0, 240);
}

const activeRuns = new Set<string>();

export async function executeGoogleAttachmentMigration(input: {
  workspaceId: string;
  userId: string;
  previewPayload: Record<string, unknown>;
}) {
  const runId = randomUUID();
  if (activeRuns.has(input.userId)) throw new AccountApiError("已有迁移任务正在执行，请稍后重试。", 409);
  activeRuns.add(input.userId);
  try {
    const current = await scanGoogleAttachments(input.workspaceId, input.userId);
    const expectedIds = Array.isArray(input.previewPayload.attachmentIds) ? input.previewPayload.attachmentIds.filter((value): value is string => typeof value === "string") : [];
    const currentDigest = scanTargetDigest(current.items);
    const expectedDigest = typeof input.previewPayload.targetDigest === "string" ? input.previewPayload.targetDigest : "";
    if (currentDigest !== expectedDigest || expectedIds.length !== current.items.length || expectedIds.some((id) => !current.items.some((item) => item.attachmentId === id))) {
      throw new AccountApiError("扫描结果已变化，请重新扫描后再执行。", 409);
    }
    const results: Array<{ attachmentId: string; table: MigrationTable; status: MigrationRunItemStatus; reason?: string }> = [];
    for (const item of current.items) {
      console.info("google_attachment_migration_item", { runId, stage: "item_started", table: item.table, attachmentId: item.attachmentId });
      if (!item.migratable && item.sourceStatus !== "target_conflict") {
        results.push({ attachmentId: item.attachmentId, table: item.table, status: "skipped", reason: item.reason || item.sourceStatus });
        continue;
      }
      const config = tableConfig[item.table];
      try {
        const { data: rawRow, error: rowError } = await getSupabaseAdmin().from(item.table).select(`${migrationTableSelect[item.table]},storage_bucket,storage_path` as string).eq("id", item.attachmentId).eq("user_id", input.workspaceId).maybeSingle();
        const row = rawRow as any;
        if (rowError || !row) throw new Error("附件索引不存在或无法读取");
        if (row.storage_provider === "supabase") {
          results.push({ attachmentId: item.attachmentId, table: item.table, status: "already_migrated" });
          continue;
        }
        if (row.storage_provider !== "google_drive" || !row.provider_file_id) {
          results.push({ attachmentId: item.attachmentId, table: item.table, status: "skipped", reason: "源附件索引已变化" });
          continue;
        }
        const metadata = await getGoogleDriveAttachmentMetadata(row.provider_file_id);
        if (!metadata.downloadable || metadata.trashed || !metadata.withinConfiguredRoot || metadata.mimeType !== item.databaseMime || metadata.size !== item.databaseSize) {
          results.push({ attachmentId: item.attachmentId, table: item.table, status: "skipped", reason: "Google 元数据已变化" });
          continue;
        }
        const source = await getGoogleDriveContent(row.provider_file_id);
        const sourceBuffer = Buffer.from(await source.arrayBuffer());
        const sourceSha256 = sha256Hex(sourceBuffer);
        const storage = getSupabaseAdmin().storage.from(config.bucket);
        const existing = await storage.download(item.targetPath);
        if (existing.data) {
          const existingBuffer = Buffer.from(await existing.data.arrayBuffer());
          const targetSha256 = sha256Hex(existingBuffer);
          if (existingBuffer.length !== sourceBuffer.length || targetSha256 !== sourceSha256 || (existing.data.type && existing.data.type !== metadata.mimeType)) {
            results.push({ attachmentId: item.attachmentId, table: item.table, status: "conflict", reason: "目标对象内容不一致" });
            continue;
          }
        } else {
          const upload = await storage.upload(item.targetPath, sourceBuffer, { contentType: metadata.mimeType, upsert: false });
          if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error(upload.error.message);
          const check = await storage.download(item.targetPath);
          if (check.error || !check.data) throw new Error(check.error?.message || "目标对象无法读取");
          const targetBuffer = Buffer.from(await check.data.arrayBuffer());
          const targetSha256 = sha256Hex(targetBuffer);
          if (targetBuffer.length !== sourceBuffer.length || targetSha256 !== sourceSha256 || (check.data.type && check.data.type !== metadata.mimeType)) throw new Error("目标对象校验失败");
        }
        const { error: updateError } = await getSupabaseAdmin().from(item.table).update({ storage_provider: "supabase", storage_bucket: config.bucket, storage_path: item.targetPath }).eq("id", item.attachmentId).eq("user_id", input.workspaceId).eq("storage_provider", "google_drive");
        if (updateError) throw new Error(updateError.message);
        results.push({ attachmentId: item.attachmentId, table: item.table, status: "migrated" });
        console.info("google_attachment_migration_item", { runId, stage: "item_completed", table: item.table, attachmentId: item.attachmentId, status: "migrated", bytes: sourceBuffer.length });
      } catch (error) {
        console.error("google_attachment_migration_item_failed", { runId, stage: "item_failed", table: item.table, attachmentId: item.attachmentId, message: safeError(error) });
        results.push({ attachmentId: item.attachmentId, table: item.table, status: "failed", reason: safeError(error) });
      }
    }
    return { runId, results, summary: { migrated: results.filter((item) => item.status === "migrated").length, alreadyMigrated: results.filter((item) => item.status === "already_migrated").length, failed: results.filter((item) => item.status === "failed").length, skipped: results.filter((item) => item.status === "skipped").length, conflicts: results.filter((item) => item.status === "conflict").length } };
  } finally {
    activeRuns.delete(input.userId);
  }
}
