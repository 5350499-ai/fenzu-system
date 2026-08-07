import "server-only";

import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getGoogleDriveContent } from "@/lib/server/google-drive";

const ATTACHMENT_TABLES = ["contract_files", "rent_payment_files", "expense_files"] as const;
type AttachmentTable = (typeof ATTACHMENT_TABLES)[number];

type AttachmentRow = {
  id: string;
  user_id: string;
  contract_id?: string | null;
  tenant_id?: string | null;
  rent_payment_id?: string | null;
  expense_id?: string | null;
  storage_provider?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  provider_file_id?: string | null;
  file_name: string;
  file_type: string;
  file_size: number | null;
  uploaded_at: string | null;
};

export type AttachmentExportManifestEntry = {
  attachmentId: string;
  sourceTable: AttachmentTable;
  parentType: "tenant" | "contract" | "rentPayment" | "expense" | "unknown";
  parentId: string | null;
  tenantId: string | null;
  contractId: string | null;
  rentPaymentId: string | null;
  expenseId: string | null;
  storageProvider: "supabase" | "google_drive" | "unknown";
  bucket: string | null;
  storagePath: string | null;
  providerFileId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string | null;
  checksum: string | null;
  zipPath: string | null;
  status: "exported" | "missing" | "failed";
  error?: string;
};

function parentFor(table: AttachmentTable, row: AttachmentRow): Pick<AttachmentExportManifestEntry, "parentType" | "parentId"> {
  if (table === "contract_files") {
    return row.contract_id ? { parentType: "contract", parentId: row.contract_id }
      : row.tenant_id ? { parentType: "tenant", parentId: row.tenant_id }
        : { parentType: "unknown", parentId: null };
  }
  if (table === "rent_payment_files") return { parentType: "rentPayment", parentId: row.rent_payment_id || null };
  if (table === "expense_files") return { parentType: "expense", parentId: row.expense_id || null };
  return { parentType: "unknown", parentId: null };
}

function safeName(value: string) {
  return value.replace(/[\\/\r\n]/g, "_").replace(/[^\w.\-\u4e00-\u9fa5 ]+/g, "_").slice(0, 120) || "attachment";
}

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "无法读取附件文件";
}

async function loadRows(admin: ReturnType<typeof getSupabaseAdmin>) {
  const all: Array<{ table: AttachmentTable; row: AttachmentRow }> = [];
  for (const table of ATTACHMENT_TABLES) {
    const { data, error } = await admin.from(table).select("*").order("uploaded_at", { ascending: true });
    if (error) throw new Error(`${table} 附件索引读取失败：${error.message}`);
    for (const row of (data || []) as AttachmentRow[]) all.push({ table, row });
  }
  return all;
}

export async function createAttachmentZipExport() {
  const admin = getSupabaseAdmin();
  const rows = await loadRows(admin);
  const files: Record<string, Uint8Array> = {};
  const manifest: AttachmentExportManifestEntry[] = [];
  const now = new Date();

  for (const { table, row } of rows) {
    const parent = parentFor(table, row);
    const storageProvider = row.storage_provider === "supabase" || row.storage_provider === "google_drive" ? row.storage_provider : "unknown";
    const safeFileName = safeName(row.file_name);
    const zipPath = `attachments/${row.id}-${safeFileName}`;
    const entry: AttachmentExportManifestEntry = {
      attachmentId: row.id, sourceTable: table, ...parent,
      tenantId: row.tenant_id || null, contractId: row.contract_id || null,
      rentPaymentId: row.rent_payment_id || null, expenseId: row.expense_id || null,
      storageProvider, bucket: row.storage_bucket || null, storagePath: row.storage_path || null,
      providerFileId: row.provider_file_id || null, fileName: row.file_name, mimeType: row.file_type,
      fileSize: Number(row.file_size || 0), uploadedAt: row.uploaded_at || null,
      checksum: null, zipPath, status: "failed"
    };

    try {
      let bytes: Uint8Array;
      if (storageProvider === "supabase") {
        if (!row.storage_bucket || !row.storage_path) {
          entry.status = "missing"; entry.error = "缺少 Supabase bucket 或 storage path"; manifest.push(entry); continue;
        }
        const { data, error } = await admin.storage.from(row.storage_bucket).download(row.storage_path);
        if (error || !data) throw new Error(error?.message || "Storage 文件不存在");
        bytes = new Uint8Array(await data.arrayBuffer());
      } else if (storageProvider === "google_drive") {
        if (!row.provider_file_id) {
          entry.status = "missing"; entry.error = "缺少 Google Drive provider file id"; manifest.push(entry); continue;
        }
        const response = await getGoogleDriveContent(row.provider_file_id);
        bytes = new Uint8Array(await response.arrayBuffer());
      } else {
        entry.status = "missing"; entry.error = "未知附件存储提供方"; manifest.push(entry); continue;
      }
      entry.fileSize = bytes.byteLength; entry.checksum = checksum(bytes); entry.status = "exported"; files[zipPath] = bytes;
    } catch (error) {
      entry.status = "failed"; entry.error = errorMessage(error);
    }
    manifest.push(entry);
  }

  const manifestDocument = {
    manifestVersion: 1, generatedBy: "Fenzu System", generatedAt: now.toISOString(),
    attachmentCount: manifest.length,
    exportedCount: manifest.filter((entry) => entry.status === "exported").length,
    skippedCount: manifest.filter((entry) => entry.status !== "exported").length,
    entries: manifest
  };
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifestDocument, null, 2));
  const zip = zipSync(files, { level: 6 });
  const part = (value: number) => String(value).padStart(2, "0");
  const fileName = `attachments-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.zip`;
  return { bytes: zip, fileName, manifest: manifestDocument };
}
