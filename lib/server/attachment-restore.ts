import "server-only";

import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createGoogleResumableUpload,
  getGoogleDriveContent,
  stampGoogleUpload,
  verifyGoogleUpload,
  type DriveAttachmentKind
} from "@/lib/server/google-drive";
import { attachmentStorageConfigs, type AttachmentStorageBucket } from "@/lib/server/supabase-attachment-upload";
import type { AttachmentExportManifestEntry } from "@/lib/server/attachment-export";

type ManifestDocument = {
  manifestVersion: number;
  generatedAt?: string;
  attachmentCount: number;
  exportedCount: number;
  skippedCount: number;
  entries: AttachmentExportManifestEntry[];
};

type AttachmentRow = {
  id: string;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  provider_file_id: string | null;
};
type ParentMaps = {
  tenants: Set<string>;
  contracts: Map<string, string | null>;
  rentPayments: Set<string>;
  expenses: Set<string>;
};

export type AttachmentRestoreReport = {
  total: number;
  restored: number;
  existing: number;
  repaired: number;
  missing: number;
  checksumFailed: number;
  orphan: number;
  uploadFailed: number;
  skipped: number;
  errors: Array<{ attachmentId: string | null; category: string; reason: string }>;
};

export type AttachmentRestorePreview = AttachmentRestoreReport & {
  generatedAt: string | null;
  recoverable: number;
  abnormal: number;
};

const tableNames = ["contract_files", "rent_payment_files", "expense_files"] as const;
type AttachmentTable = (typeof tableNames)[number];

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function reason(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "附件处理失败";
}

function emptyReport(): AttachmentRestoreReport {
  return { total: 0, restored: 0, existing: 0, repaired: 0, missing: 0, checksumFailed: 0, orphan: 0, uploadFailed: 0, skipped: 0, errors: [] };
}

function addError(report: AttachmentRestoreReport, attachmentId: string | null, category: string, message: string) {
  report.errors.push({ attachmentId, category, reason: message.slice(0, 240) });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseArchive(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("ZIP 文件无法解析或已损坏。");
  }
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) throw new Error("ZIP 缺少 manifest.json。");
  let manifest: ManifestDocument;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as ManifestDocument;
  } catch {
    throw new Error("manifest.json 不是有效 JSON。");
  }
  if (!isObject(manifest) || manifest.manifestVersion !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error("附件清单版本不兼容或格式不完整。");
  }
  return { files, manifest };
}

async function loadCurrent(admin: ReturnType<typeof getSupabaseAdmin>, ownerId: string) {
  const [contractFiles, rentFiles, expenseFiles, tenants, contracts, payments, expenses] = await Promise.all([
    admin.from("contract_files").select("*").eq("user_id", ownerId),
    admin.from("rent_payment_files").select("*").eq("user_id", ownerId),
    admin.from("expense_files").select("*").eq("user_id", ownerId),
    admin.from("tenants").select("id").eq("user_id", ownerId),
    admin.from("contracts").select("id,tenant_id").eq("user_id", ownerId),
    admin.from("rent_payments").select("id").eq("user_id", ownerId),
    admin.from("expenses").select("id").eq("user_id", ownerId)
  ]);
  const failed = [contractFiles, rentFiles, expenseFiles, tenants, contracts, payments, expenses].find((result) => result.error);
  if (failed?.error) throw new Error(`附件恢复读取当前数据失败：${failed.error.message}`);
  const rows = new Map<string, AttachmentRow>();
  for (const row of [...(contractFiles.data || []), ...(rentFiles.data || []), ...(expenseFiles.data || [])] as AttachmentRow[]) rows.set(row.id, row);
  return {
    rows,
    parents: {
      tenants: new Set((tenants.data || []).map((row) => row.id)),
      contracts: new Map((contracts.data || []).map((row) => [row.id, row.tenant_id || null])),
      rentPayments: new Set((payments.data || []).map((row) => row.id)),
      expenses: new Set((expenses.data || []).map((row) => row.id))
    } satisfies ParentMaps
  };
}

function validTable(value: string): value is AttachmentTable {
  return (tableNames as readonly string[]).includes(value);
}

function parentExists(entry: AttachmentExportManifestEntry, parents: ParentMaps) {
  if (!validTable(entry.sourceTable)) return false;
  if (entry.sourceTable === "contract_files") {
    if (entry.tenantId && !parents.tenants.has(entry.tenantId)) return false;
    if (entry.contractId && (!parents.contracts.has(entry.contractId) || parents.contracts.get(entry.contractId) !== entry.tenantId)) return false;
    return Boolean(entry.tenantId || entry.contractId);
  }
  if (entry.sourceTable === "rent_payment_files") return Boolean(entry.rentPaymentId && parents.rentPayments.has(entry.rentPaymentId));
  return Boolean(entry.expenseId && parents.expenses.has(entry.expenseId));
}

function archiveMember(files: Record<string, Uint8Array>, entry: AttachmentExportManifestEntry) {
  if (!entry.zipPath || !entry.zipPath.startsWith("attachments/") || entry.zipPath.includes("..")) return null;
  return files[entry.zipPath] || null;
}

function isSupabaseBucket(value: string | null): value is AttachmentStorageBucket {
  return Boolean(value && Object.prototype.hasOwnProperty.call(attachmentStorageConfigs, value));
}

function driveKind(table: AttachmentTable): DriveAttachmentKind {
  return table === "contract_files" ? "contract-files" : table === "rent_payment_files" ? "rent-payment-files" : "expense-files";
}

function metadataFor(entry: AttachmentExportManifestEntry, ownerId: string, provider: "supabase" | "google_drive", bucket: string | null, path: string | null, providerFileId: string | null, size: number) {
  const base = {
    id: entry.attachmentId,
    user_id: ownerId,
    storage_provider: provider,
    storage_bucket: bucket,
    storage_path: path,
    provider_file_id: providerFileId,
    file_name: entry.fileName,
    file_type: entry.mimeType,
    file_size: size,
    uploaded_at: entry.uploadedAt || new Date().toISOString()
  };
  if (entry.sourceTable === "contract_files") return { ...base, tenant_id: entry.tenantId, contract_id: entry.contractId };
  if (entry.sourceTable === "rent_payment_files") return { ...base, rent_payment_id: entry.rentPaymentId };
  return { ...base, expense_id: entry.expenseId };
}

async function storageChecksum(admin: ReturnType<typeof getSupabaseAdmin>, bucket: AttachmentStorageBucket, path: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  return sha256(new Uint8Array(await data.arrayBuffer()));
}

async function uploadGoogle(entry: AttachmentExportManifestEntry, bytes: Uint8Array, ownerId: string) {
  const upload = await createGoogleResumableUpload({ kind: driveKind(entry.sourceTable), ownerId, fileName: entry.fileName, fileType: entry.mimeType, fileSize: bytes.byteLength });
  const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": entry.mimeType, "Content-Length": String(bytes.byteLength) }, body: Buffer.from(bytes), cache: "no-store" });
  if (!response.ok) throw new Error(`Google Drive 上传失败（${response.status}）。`);
  const file = await response.json() as { id?: string };
  if (!file.id) throw new Error("Google Drive 未返回文件 ID。");
  await stampGoogleUpload({ fileId: file.id, kind: driveKind(entry.sourceTable), ownerId, uploadId: upload.uploadId });
  await verifyGoogleUpload({ fileId: file.id, kind: driveKind(entry.sourceTable), ownerId, uploadId: upload.uploadId, expectedType: entry.mimeType, expectedSize: bytes.byteLength });
  return file.id;
}

function classifyPreview(report: AttachmentRestoreReport): AttachmentRestorePreview {
  const abnormal = report.missing + report.checksumFailed + report.orphan + report.uploadFailed + report.skipped;
  return { ...report, generatedAt: null, recoverable: report.total - abnormal, abnormal };
}

export async function previewAttachmentZipRestore(bytes: Uint8Array, ownerId: string): Promise<AttachmentRestorePreview> {
  const { files, manifest } = parseArchive(bytes);
  const current = await loadCurrent(getSupabaseAdmin(), ownerId);
  const report = emptyReport();
  report.total = manifest.entries.length;
  for (const entry of manifest.entries) {
    if (!isObject(entry) || !entry.attachmentId || !validTable(entry.sourceTable)) { report.skipped += 1; addError(report, null, "invalid", "清单条目缺少有效附件 ID 或来源表。"); continue; }
    if (entry.status !== "exported" || !archiveMember(files, entry)) { report.missing += 1; addError(report, entry.attachmentId, "missing", "ZIP 中没有可用的附件文件。"); continue; }
    if (!parentExists(entry, current.parents)) { report.orphan += 1; addError(report, entry.attachmentId, "orphan", "找不到对应的业务记录。"); continue; }
    const existing = current.rows.get(entry.attachmentId);
    if (existing) report.existing += 1; else report.restored += 1;
  }
  return { ...classifyPreview(report), generatedAt: manifest.generatedAt || null };
}

export async function restoreAttachmentZip(bytes: Uint8Array, ownerId: string): Promise<AttachmentRestoreReport> {
  const { files, manifest } = parseArchive(bytes);
  const admin = getSupabaseAdmin();
  const current = await loadCurrent(admin, ownerId);
  const report = emptyReport();
  report.total = manifest.entries.length;
  for (const entry of manifest.entries) {
    const id = isObject(entry) && typeof entry.attachmentId === "string" ? entry.attachmentId : null;
    try {
      if (!id || !validTable(entry.sourceTable)) { report.skipped += 1; addError(report, id, "invalid", "清单条目无效。"); continue; }
      if (entry.status !== "exported") { report.skipped += 1; addError(report, id, "skipped", entry.error || "导出时未成功归档。"); continue; }
      const bytesInZip = archiveMember(files, entry);
      if (!bytesInZip) { report.missing += 1; addError(report, id, "missing", "ZIP 中缺少实际文件。"); continue; }
      if (entry.fileSize > 0 && bytesInZip.byteLength !== entry.fileSize) { report.checksumFailed += 1; addError(report, id, "checksum", "文件大小与清单不一致。"); continue; }
      if (!entry.checksum || sha256(bytesInZip) !== entry.checksum) { report.checksumFailed += 1; addError(report, id, "checksum", "文件 checksum 校验失败。"); continue; }
      if (!parentExists(entry, current.parents)) { report.orphan += 1; addError(report, id, "orphan", "找不到对应的业务记录，未创建悬空关联。"); continue; }
      const existing = current.rows.get(id);
      if (entry.storageProvider === "supabase") {
        if (!isSupabaseBucket(entry.bucket) || !entry.storagePath) { report.skipped += 1; addError(report, id, "provider", "Supabase bucket 或路径无效。"); continue; }
        const currentChecksum = existing?.storage_provider === "supabase" && existing.storage_bucket === entry.bucket && existing.storage_path === entry.storagePath ? await storageChecksum(admin, entry.bucket, entry.storagePath) : null;
        if (existing && currentChecksum === entry.checksum) { report.existing += 1; continue; }
        const { error: uploadError } = await admin.storage.from(entry.bucket).upload(entry.storagePath, bytesInZip, { contentType: entry.mimeType, upsert: true });
        if (uploadError) { report.uploadFailed += 1; addError(report, id, "upload", uploadError.message); continue; }
        const { error: rowError } = await (admin.from(entry.sourceTable) as any).upsert(metadataFor(entry, ownerId, "supabase", entry.bucket, entry.storagePath, null, bytesInZip.byteLength), { onConflict: "id" });
        if (rowError) { report.uploadFailed += 1; addError(report, id, "metadata", rowError.message); continue; }
        if (existing) report.repaired += 1; else report.restored += 1;
      } else if (entry.storageProvider === "google_drive") {
        if (existing?.storage_provider === "google_drive" && existing.provider_file_id) {
          try {
            const currentResponse = await getGoogleDriveContent(existing.provider_file_id);
            const currentBytes = new Uint8Array(await currentResponse.arrayBuffer());
            if (sha256(currentBytes) === entry.checksum) { report.existing += 1; continue; }
          } catch { /* repair below */ }
        }
        const providerFileId = await uploadGoogle(entry, bytesInZip, ownerId);
        const { error: rowError } = await (admin.from(entry.sourceTable) as any).upsert(metadataFor(entry, ownerId, "google_drive", null, null, providerFileId, bytesInZip.byteLength), { onConflict: "id" });
        if (rowError) { report.uploadFailed += 1; addError(report, id, "metadata", rowError.message); continue; }
        if (existing) report.repaired += 1; else report.restored += 1;
      } else {
        report.skipped += 1; addError(report, id, "provider", "不支持的附件存储提供商。");
      }
    } catch (error) {
      report.uploadFailed += 1;
      addError(report, id, "error", reason(error));
    }
  }
  return report;
}
