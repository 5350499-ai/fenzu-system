import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { AccountApiError } from "@/lib/server/account-auth";
import { getGoogleAccessToken, getGoogleDriveAttachmentMetadata, GoogleDriveAccessError } from "@/lib/server/google-drive";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildGoogleMigrationTargetPath, migrationTableSelect } from "@/lib/google-attachment-migration-rules";

export type MigrationTable = "contract_files" | "rent_payment_files" | "expense_files";
export type MigrationStatus = "readable" | "missing" | "trashed" | "permission_denied" | "authorization_error" | "metadata_mismatch" | "duplicate" | "outside_root" | "target_conflict" | "target_exists" | "scan_failed";

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
  const previewToken = signPreview({ userId, workspaceId, scannedAt: now.toISOString(), expiresAt, attachmentIds: items.map((item) => item.attachmentId), targetDigest: fingerprint(items.map((item) => `${item.attachmentId}:${item.targetBucket}:${item.targetPath}`).join("|")) });
  return { scannedAt: now.toISOString(), expiresAt, items, summary, previewToken };
}
