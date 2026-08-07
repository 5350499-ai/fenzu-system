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

type Property = { id: string; name: string | null; address: string | null };
type Room = { id: string; property_id: string; name: string | null; room_number: string | null };
type Tenant = { id: string; property_id: string; room_id: string; name: string | null };
type Contract = { id: string; property_id: string; room_id: string | null; tenant_id: string | null; start_date: string | null };
type Payment = { id: string; property_id: string; room_id: string | null; tenant_id: string | null; payment_date: string | null; rent_month: string | null };
type Expense = { id: string; property_id: string; room_id: string | null; payment_date: string | null; expense_month: string | null };

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
  archiveRelativePath: string | null;
  /** Deprecated alias retained for consumers that read Attachment Export V1. */
  zipPath: string | null;
  exportStatus: "success" | "missing" | "failed";
  failureReason?: string;
  /** Compatibility aliases for the V1 manifest. */
  status: "exported" | "missing" | "failed";
  error?: string;
};

function checksum(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 240) : "无法读取附件文件"; }

function safeSegment(value: string | null | undefined, fallback: string) {
  const clean = String(value || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 100);
  return clean || fallback;
}

function shortId(id: string) { return id.replace(/-/g, "").slice(-8); }
function datePart(value: string | null | undefined) { return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : new Date().toISOString().slice(0, 10); }
function fileLeaf(row: AttachmentRow, date: string | null | undefined, kind: string, used: Set<string>) {
  const original = safeSegment(row.file_name, kind);
  const extension = original.includes(".") ? "" : row.file_type === "application/pdf" ? ".pdf" : row.file_type.startsWith("image/") ? ".jpg" : "";
  const base = `${datePart(date)}_${original}${extension}`;
  let result = base;
  if (used.has(result)) result = `${datePart(date)}_${original.replace(/(\.[^.]+)$/, `_${shortId(row.id)}$1`)}${extension && !original.includes(".") ? extension : ""}`;
  let counter = 2;
  while (used.has(result)) result = `${datePart(date)}_${original.replace(/(\.[^.]+)$/, `_${counter}$1`)}${extension && !original.includes(".") ? extension : ""}`;
  used.add(result);
  return result;
}

function parentFor(table: AttachmentTable, row: AttachmentRow) {
  if (table === "contract_files") return row.contract_id ? { parentType: "contract" as const, parentId: row.contract_id } : row.tenant_id ? { parentType: "tenant" as const, parentId: row.tenant_id } : { parentType: "unknown" as const, parentId: null };
  if (table === "rent_payment_files") return { parentType: "rentPayment" as const, parentId: row.rent_payment_id || null };
  return { parentType: "expense" as const, parentId: row.expense_id || null };
}

async function loadContext(admin: ReturnType<typeof getSupabaseAdmin>, ownerId: string) {
  const [properties, rooms, tenants, contracts, payments, expenses] = await Promise.all([
    admin.from("properties").select("id,name,address").eq("user_id", ownerId), admin.from("rooms").select("id,property_id,name,room_number").eq("user_id", ownerId), admin.from("tenants").select("id,property_id,room_id,name").eq("user_id", ownerId),
    admin.from("contracts").select("id,property_id,room_id,tenant_id,start_date").eq("user_id", ownerId), admin.from("rent_payments").select("id,property_id,room_id,tenant_id,payment_date,rent_month").eq("user_id", ownerId), admin.from("expenses").select("id,property_id,room_id,payment_date,expense_month").eq("user_id", ownerId)
  ]);
  const failed = [properties, rooms, tenants, contracts, payments, expenses].find((result) => result.error);
  if (failed?.error) throw new Error(`附件归档关系读取失败：${failed.error.message}`);
  return {
    properties: new Map((properties.data || []).map((row) => [row.id, row as Property])), rooms: new Map((rooms.data || []).map((row) => [row.id, row as Room])), tenants: new Map((tenants.data || []).map((row) => [row.id, row as Tenant])),
    contracts: new Map((contracts.data || []).map((row) => [row.id, row as Contract])), payments: new Map((payments.data || []).map((row) => [row.id, row as Payment])), expenses: new Map((expenses.data || []).map((row) => [row.id, row as Expense]))
  };
}

async function loadRows(admin: ReturnType<typeof getSupabaseAdmin>, ownerId: string) {
  const all: Array<{ table: AttachmentTable; row: AttachmentRow }> = [];
  for (const table of ATTACHMENT_TABLES) {
    const { data, error } = await admin.from(table).select("*").eq("user_id", ownerId).order("uploaded_at", { ascending: true });
    if (error) throw new Error(`${table} 附件索引读取失败：${error.message}`);
    for (const row of (data || []) as AttachmentRow[]) all.push({ table, row });
  }
  return all;
}

function readablePath(table: AttachmentTable, row: AttachmentRow, context: Awaited<ReturnType<typeof loadContext>>, date: string | null | undefined, used: Set<string>) {
  const parent = parentFor(table, row);
  const tenant = row.tenant_id ? context.tenants.get(row.tenant_id) : null;
  const contract = row.contract_id ? context.contracts.get(row.contract_id) : null;
  const payment = row.rent_payment_id ? context.payments.get(row.rent_payment_id) : null;
  const expense = row.expense_id ? context.expenses.get(row.expense_id) : null;
  const propertyId = tenant?.property_id || contract?.property_id || payment?.property_id || expense?.property_id || null;
  const roomId = tenant?.room_id || contract?.room_id || payment?.room_id || expense?.room_id || null;
  const property = propertyId ? context.properties.get(propertyId) : null;
  const room = roomId ? context.rooms.get(roomId) : null;
  const propertyFolder = safeSegment(property?.name || property?.address, "未分类房源");
  const roomFolder = safeSegment(room?.room_number || room?.name, "未分类房间");
  const tenantFolder = safeSegment(tenant?.name, "未分类租客");
  const kind = table === "contract_files" ? "合同" : table === "rent_payment_files" ? "收款" : "房屋支出";
  const root = table === "expense_files" ? ["附件归档", "房源", propertyFolder, kind] : ["附件归档", "房源", propertyFolder, roomFolder, tenantFolder, kind];
  return `${root.join("/")}/${fileLeaf(row, date, kind, used)}`;
}

export async function createAttachmentZipExport(ownerId: string) {
  const admin = getSupabaseAdmin();
  const context = await loadContext(admin, ownerId);
  const rows = await loadRows(admin, ownerId);
  const files: Record<string, Uint8Array> = {};
  const manifest: AttachmentExportManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const now = new Date();
  for (const { table, row } of rows) {
    const parent = parentFor(table, row);
    const provider = row.storage_provider === "supabase" || row.storage_provider === "google_drive" ? row.storage_provider : "unknown";
    const date = table === "contract_files" ? context.contracts.get(row.contract_id || "")?.start_date : table === "rent_payment_files" ? context.payments.get(row.rent_payment_id || "")?.payment_date || context.payments.get(row.rent_payment_id || "")?.rent_month : context.expenses.get(row.expense_id || "")?.payment_date || context.expenses.get(row.expense_id || "")?.expense_month;
    const archivePath = readablePath(table, row, context, date, usedPaths);
    const entry: AttachmentExportManifestEntry = { attachmentId: row.id, sourceTable: table, ...parent, tenantId: row.tenant_id || null, contractId: row.contract_id || null, rentPaymentId: row.rent_payment_id || null, expenseId: row.expense_id || null, storageProvider: provider, bucket: row.storage_bucket || null, storagePath: row.storage_path || null, providerFileId: row.provider_file_id || null, fileName: row.file_name, mimeType: row.file_type, fileSize: Number(row.file_size || 0), uploadedAt: row.uploaded_at || null, checksum: null, archiveRelativePath: archivePath, zipPath: archivePath, exportStatus: "failed", status: "failed" };
    try {
      let bytes: Uint8Array;
      if (provider === "supabase") { if (!row.storage_bucket || !row.storage_path) throw new Error("缺少 Storage 路径"); const result = await admin.storage.from(row.storage_bucket).download(row.storage_path); if (result.error || !result.data) throw new Error(result.error?.message || "Storage 文件不存在"); bytes = new Uint8Array(await result.data.arrayBuffer()); }
      else if (provider === "google_drive") { if (!row.provider_file_id) throw new Error("缺少 Google Drive 文件 ID"); bytes = new Uint8Array(await (await getGoogleDriveContent(row.provider_file_id)).arrayBuffer()); }
      else throw new Error("未知附件存储提供商");
      entry.fileSize = bytes.byteLength; entry.checksum = checksum(bytes); entry.exportStatus = "success"; entry.status = "exported"; files[archivePath] = bytes;
    } catch (error) { entry.failureReason = errorMessage(error); entry.error = entry.failureReason; entry.exportStatus = provider === "unknown" ? "missing" : "failed"; entry.status = provider === "unknown" ? "missing" : "failed"; }
    manifest.push(entry);
  }
  const manifestDocument = { manifestVersion: 2, generatedBy: "Fenzu System", generatedAt: now.toISOString(), attachmentCount: manifest.length, exportedCount: manifest.filter((entry) => entry.exportStatus === "success").length, skippedCount: manifest.filter((entry) => entry.exportStatus !== "success").length, entries: manifest };
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifestDocument, null, 2));
  const zip = zipSync(files, { level: 6 });
  const part = (value: number) => String(value).padStart(2, "0");
  return { bytes: zip, fileName: `attachments-archive-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.zip`, manifest: manifestDocument };
}
