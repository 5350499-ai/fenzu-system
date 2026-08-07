import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createGoogleResumableUpload, getGoogleDriveContent, stampGoogleUpload, verifyGoogleUpload, type DriveAttachmentKind } from "@/lib/server/google-drive";
import { attachmentStorageConfigs, type AttachmentStorageBucket } from "@/lib/server/supabase-attachment-upload";
import type { AttachmentExportManifestEntry } from "@/lib/server/attachment-export";

export type AttachmentManifestDocument = {
  manifestVersion: number;
  generatedAt?: string;
  attachmentCount: number;
  exportedCount: number;
  skippedCount: number;
  entries: AttachmentExportManifestEntry[];
};

type AttachmentRow = { id: string; storage_provider: string | null; storage_bucket: string | null; storage_path: string | null; provider_file_id: string | null };
type AttachmentTable = "contract_files" | "rent_payment_files" | "expense_files";
type ParentMaps = { tenants: Set<string>; contracts: Map<string, string | null>; rentPayments: Set<string>; expenses: Set<string> };

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

export type AttachmentRestorePreview = AttachmentRestoreReport & { generatedAt: string | null; recoverable: number; abnormal: number };

const tableNames = ["contract_files", "rent_payment_files", "expense_files"] as const;

export function validateAttachmentManifest(value: unknown): AttachmentManifestDocument {
  const document = value as Partial<AttachmentManifestDocument> | null;
  if (!document || document.manifestVersion !== 1 || !Array.isArray(document.entries)) throw new Error("备份文件格式无效：缺少兼容的 manifest.json。");
  return document as AttachmentManifestDocument;
}

function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function message(error: unknown) { return error instanceof Error ? error.message.slice(0, 240) : "附件处理失败。"; }
function emptyReport(): AttachmentRestoreReport { return { total: 0, restored: 0, existing: 0, repaired: 0, missing: 0, checksumFailed: 0, orphan: 0, uploadFailed: 0, skipped: 0, errors: [] }; }
function addError(report: AttachmentRestoreReport, attachmentId: string | null, category: string, reason: string) { report.errors.push({ attachmentId, category, reason: reason.slice(0, 240) }); }
function validTable(value: string): value is AttachmentTable { return (tableNames as readonly string[]).includes(value); }

async function loadCurrent(admin: ReturnType<typeof getSupabaseAdmin>, ownerId: string) {
  const [contractFiles, rentFiles, expenseFiles, tenants, contracts, payments, expenses] = await Promise.all([
    admin.from("contract_files").select("*").eq("user_id", ownerId), admin.from("rent_payment_files").select("*").eq("user_id", ownerId), admin.from("expense_files").select("*").eq("user_id", ownerId),
    admin.from("tenants").select("id").eq("user_id", ownerId), admin.from("contracts").select("id,tenant_id").eq("user_id", ownerId), admin.from("rent_payments").select("id").eq("user_id", ownerId), admin.from("expenses").select("id").eq("user_id", ownerId)
  ]);
  const failed = [contractFiles, rentFiles, expenseFiles, tenants, contracts, payments, expenses].find((result) => result.error);
  if (failed?.error) throw new Error(`无法读取当前附件或业务记录：${failed.error.message}`);
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

function parentExists(entry: AttachmentExportManifestEntry, parents: ParentMaps) {
  if (!validTable(entry.sourceTable)) return false;
  if (entry.sourceTable === "contract_files") {
    if (entry.tenantId && !parents.tenants.has(entry.tenantId)) return false;
    if (entry.contractId && (!parents.contracts.has(entry.contractId) || parents.contracts.get(entry.contractId) !== entry.tenantId)) return false;
    return Boolean(entry.tenantId || entry.contractId);
  }
  return entry.sourceTable === "rent_payment_files" ? Boolean(entry.rentPaymentId && parents.rentPayments.has(entry.rentPaymentId)) : Boolean(entry.expenseId && parents.expenses.has(entry.expenseId));
}

function isSupabaseBucket(value: string | null): value is AttachmentStorageBucket { return Boolean(value && Object.prototype.hasOwnProperty.call(attachmentStorageConfigs, value)); }
function driveKind(table: AttachmentTable): DriveAttachmentKind { return table === "contract_files" ? "contract-files" : table === "rent_payment_files" ? "rent-payment-files" : "expense-files"; }

function metadataFor(entry: AttachmentExportManifestEntry, ownerId: string, provider: "supabase" | "google_drive", bucket: string | null, path: string | null, providerFileId: string | null, size: number) {
  const base = { id: entry.attachmentId, user_id: ownerId, storage_provider: provider, storage_bucket: bucket, storage_path: path, provider_file_id: providerFileId, file_name: entry.fileName, file_type: entry.mimeType, file_size: size, uploaded_at: entry.uploadedAt || new Date().toISOString() };
  if (entry.sourceTable === "contract_files") return { ...base, tenant_id: entry.tenantId, contract_id: entry.contractId };
  return entry.sourceTable === "rent_payment_files" ? { ...base, rent_payment_id: entry.rentPaymentId } : { ...base, expense_id: entry.expenseId };
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

function previewResult(report: AttachmentRestoreReport, generatedAt: string | null): AttachmentRestorePreview {
  const abnormal = report.missing + report.checksumFailed + report.orphan + report.uploadFailed + report.skipped;
  return { ...report, generatedAt, recoverable: report.total - abnormal, abnormal };
}

export async function previewAttachmentManifestRestore(manifestValue: unknown, ownerId: string) {
  const manifest = validateAttachmentManifest(manifestValue);
  const current = await loadCurrent(getSupabaseAdmin(), ownerId);
  const report = emptyReport(); report.total = manifest.entries.length;
  for (const entry of manifest.entries) {
    if (!entry || !entry.attachmentId || !validTable(entry.sourceTable)) { report.skipped++; addError(report, null, "invalid", "清单条目缺少有效附件 ID 或来源表。"); continue; }
    if (entry.status !== "exported" || !entry.zipPath) { report.missing++; addError(report, entry.attachmentId, "missing", "ZIP 中没有可用的附件文件。"); continue; }
    if (!parentExists(entry, current.parents)) { report.orphan++; addError(report, entry.attachmentId, "orphan", "找不到对应的业务记录。"); continue; }
    if (current.rows.has(entry.attachmentId)) report.existing++; else report.restored++;
  }
  return previewResult(report, manifest.generatedAt || null);
}

export async function restoreAttachmentEntry(entryValue: unknown, bytes: Uint8Array, ownerId: string): Promise<AttachmentRestoreReport> {
  const report = emptyReport(); report.total = 1;
  const entry = entryValue as AttachmentExportManifestEntry;
  const id = entry && typeof entry.attachmentId === "string" ? entry.attachmentId : null;
  try {
    if (!entry || !id || !validTable(entry.sourceTable)) { report.skipped++; addError(report, id, "invalid", "清单条目无效。"); return report; }
    if (entry.status !== "exported") { report.skipped++; addError(report, id, "skipped", entry.error || "导出时未成功归档。"); return report; }
    if (!entry.zipPath || !bytes.byteLength) { report.missing++; addError(report, id, "missing", "ZIP 中缺少实际文件。"); return report; }
    if (entry.fileSize > 0 && bytes.byteLength !== entry.fileSize) { report.checksumFailed++; addError(report, id, "checksum", "文件大小与清单不一致。"); return report; }
    if (!entry.checksum || sha256(bytes) !== entry.checksum) { report.checksumFailed++; addError(report, id, "checksum", "文件 checksum 校验失败。"); return report; }
    const admin = getSupabaseAdmin(); const current = await loadCurrent(admin, ownerId);
    if (!parentExists(entry, current.parents)) { report.orphan++; addError(report, id, "orphan", "找不到对应的业务记录，未创建悬空关联。"); return report; }
    const existing = current.rows.get(id);
    if (entry.storageProvider === "supabase") {
      if (!isSupabaseBucket(entry.bucket) || !entry.storagePath) { report.skipped++; addError(report, id, "provider", "Supabase bucket 或路径无效。"); return report; }
      const currentChecksum = existing?.storage_provider === "supabase" && existing.storage_bucket === entry.bucket && existing.storage_path === entry.storagePath ? await storageChecksum(admin, entry.bucket, entry.storagePath) : null;
      if (existing && currentChecksum === entry.checksum) { report.existing++; return report; }
      const { error: uploadError } = await admin.storage.from(entry.bucket).upload(entry.storagePath, Buffer.from(bytes), { contentType: entry.mimeType, upsert: true });
      if (uploadError) { report.uploadFailed++; addError(report, id, "upload", uploadError.message); return report; }
      const { error: rowError } = await (admin.from(entry.sourceTable) as any).upsert(metadataFor(entry, ownerId, "supabase", entry.bucket, entry.storagePath, null, bytes.byteLength), { onConflict: "id" });
      if (rowError) { report.uploadFailed++; addError(report, id, "metadata", rowError.message); return report; }
      if (existing) report.repaired++; else report.restored++; return report;
    }
    if (entry.storageProvider === "google_drive") {
      if (existing?.storage_provider === "google_drive" && existing.provider_file_id) {
        try { const currentBytes = new Uint8Array(await (await getGoogleDriveContent(existing.provider_file_id)).arrayBuffer()); if (sha256(currentBytes) === entry.checksum) { report.existing++; return report; } } catch { /* repair below */ }
      }
      const providerFileId = await uploadGoogle(entry, bytes, ownerId);
      const { error: rowError } = await (admin.from(entry.sourceTable) as any).upsert(metadataFor(entry, ownerId, "google_drive", null, null, providerFileId, bytes.byteLength), { onConflict: "id" });
      if (rowError) { report.uploadFailed++; addError(report, id, "metadata", rowError.message); return report; }
      if (existing) report.repaired++; else report.restored++; return report;
    }
    report.skipped++; addError(report, id, "provider", "不支持的附件存储提供商。"); return report;
  } catch (error) { report.uploadFailed++; addError(report, id, "error", message(error)); return report; }
}

export async function restoreAttachmentZip(bytes: Uint8Array, ownerId: string): Promise<AttachmentRestoreReport> {
  throw new Error("旧版整包恢复接口已停用，请使用逐附件恢复流程。");
}
