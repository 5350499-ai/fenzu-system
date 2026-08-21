import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type AttachmentTable = "property_files" | "contract_files" | "rent_payment_files" | "expense_files";
type AttachmentProvider = "supabase" | "google_drive" | "unknown";
export type AttachmentCategory = "property" | "tenant" | "income" | "expense";
type AttachmentRow = { id: string; user_id: string; storage_provider: string | null; storage_bucket: string | null; storage_path: string | null; provider_file_id?: string | null; file_name: string; file_type?: string | null; file_size: number | null; uploaded_at?: string | null; property_id?: string | null; contract_id?: string | null; tenant_id?: string | null; rent_payment_id?: string | null; expense_id?: string | null };
type TenantRow = { id: string; name: string | null; status: string | null; actual_move_out_date?: string | null; property_id: string | null; room_id: string | null };
type PropertyRow = { id: string; name: string | null; address?: string | null };
type RoomRow = { id: string; name: string | null; room_number: string | null; property_id?: string | null };
type ContractRow = { id: string; tenant_id: string | null; property_id: string | null; room_id: string | null; start_date: string | null };
type PaymentRow = { id: string; tenant_id: string | null; property_id: string | null; room_id: string | null; payment_date: string | null; rent_month: string | null; coverage_start_date: string | null };
type ExpenseRow = { id: string; property_id: string | null; room_id: string | null; payment_date: string | null; expense_month: string | null };

export type AttachmentCleanupCandidate = { tenantId: string; tenantName: string; propertyName: string; roomName: string; status: string; actualMoveOutDate: string | null; attachmentCount: number; bytes: number; googleDriveCount: number };
export type AttachmentCleanupError = { attachmentId: string; fileName: string; reason: string };
export type AttachmentCleanupReport = { planned: number; deleted: number; failed: number; skippedGoogleDrive: number; releasedBytes: number; unreleasedBytes: number; errors: AttachmentCleanupError[] };
export type AttachmentInventoryItem = { id: string; sourceTable: AttachmentTable; category: AttachmentCategory; provider: AttachmentProvider; fileName: string; fileType: string; fileSize: number; uploadedAt: string | null; businessDate: string | null; tenantName: string | null; propertyName: string | null; roomName: string | null; categoryLabel: string; tenantId: string | null; storageBucket: string; storagePath: string | null; providerFileId: string | null };

function bytes(value: number | null | undefined) { return Math.max(0, Number(value || 0)); }
function formatDate(value: string | null | undefined) { return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null; }
function isMovedOut(tenant: TenantRow) { return Boolean(tenant.actual_move_out_date) || /退租|moved[_ -]?out|inactive|closed/i.test(tenant.status || ""); }

async function loadTenants(ownerId: string) {
  const admin = getSupabaseAdmin();
  const result = await admin.from("tenants").select("id,name,status,actual_move_out_date,property_id,room_id").eq("user_id", ownerId);
  if (result.error) throw new Error(`读取租客失败：${result.error.message}`);
  return (result.data || []) as TenantRow[];
}
async function loadContext(ownerId: string) {
  const admin = getSupabaseAdmin();
  const [tenants, properties, rooms, contracts, payments, expenses] = await Promise.all([
    loadTenants(ownerId), admin.from("properties").select("id,name,address").eq("user_id", ownerId), admin.from("rooms").select("id,name,room_number,property_id").eq("user_id", ownerId),
    admin.from("contracts").select("id,tenant_id,property_id,room_id,start_date").eq("user_id", ownerId), admin.from("rent_payments").select("id,tenant_id,property_id,room_id,payment_date,rent_month,coverage_start_date").eq("user_id", ownerId), admin.from("expenses").select("id,property_id,room_id,payment_date,expense_month").eq("user_id", ownerId)
  ]);
  const failed = [properties, rooms, contracts, payments, expenses].find((result) => result.error);
  if (failed?.error) throw new Error(`读取附件关联数据失败：${failed.error.message}`);
  return { tenants, properties: new Map((properties.data || []).map((row) => [row.id, row as PropertyRow])), rooms: new Map((rooms.data || []).map((row) => [row.id, row as RoomRow])), contracts: new Map((contracts.data || []).map((row) => [row.id, row as ContractRow])), payments: new Map((payments.data || []).map((row) => [row.id, row as PaymentRow])), expenses: new Map((expenses.data || []).map((row) => [row.id, row as ExpenseRow])) };
}
async function loadAllRows(ownerId: string) {
  const admin = getSupabaseAdmin(); const rows: Array<{ table: AttachmentTable; row: AttachmentRow }> = [];
  for (const table of ["property_files", "contract_files", "rent_payment_files", "expense_files"] as const) {
    const result = await admin.from(table).select("*").eq("user_id", ownerId).order("uploaded_at", { ascending: true });
    if (result.error) {
      const missingPropertyTable = table === "property_files" && /relation|table|schema cache|does not exist/i.test(result.error.message || "");
      if (missingPropertyTable) continue;
      throw new Error(`读取${table}失败：${result.error.message}`);
    }
    for (const row of (result.data || []) as AttachmentRow[]) rows.push({ table, row });
  }
  return rows;
}
function relatedRecords(table: AttachmentTable, row: AttachmentRow, context: Awaited<ReturnType<typeof loadContext>>) {
  const contract = row.contract_id ? context.contracts.get(row.contract_id) : null; const payment = row.rent_payment_id ? context.payments.get(row.rent_payment_id) : null; const expense = row.expense_id ? context.expenses.get(row.expense_id) : null;
  const tenantId = row.tenant_id || contract?.tenant_id || payment?.tenant_id || null; const tenant = tenantId ? context.tenants.find((item) => item.id === tenantId) : null;
  const propertyId = row.property_id || tenant?.property_id || contract?.property_id || payment?.property_id || expense?.property_id || null; const roomId = tenant?.room_id || contract?.room_id || payment?.room_id || expense?.room_id || null;
  const property = propertyId ? context.properties.get(propertyId) : null; const room = roomId ? context.rooms.get(roomId) : null;
  const businessDate = table === "property_files" ? row.uploaded_at : table === "contract_files" ? contract?.start_date : table === "rent_payment_files" ? payment?.coverage_start_date || payment?.payment_date || payment?.rent_month : expense?.payment_date || expense?.expense_month;
  return { tenantId, tenant, property, room, businessDate: formatDate(businessDate) };
}
function inventoryItem(table: AttachmentTable, row: AttachmentRow, context: Awaited<ReturnType<typeof loadContext>>): AttachmentInventoryItem {
  const related = relatedRecords(table, row, context); const category = table === "property_files" ? "property" : table === "contract_files" ? "tenant" : table === "rent_payment_files" ? "income" : "expense";
  const categoryLabel = category === "property" ? "房源附件" : category === "tenant" ? "租客附件" : category === "income" ? "收入附件" : "支出附件";
  return { id: row.id, sourceTable: table, category, provider: row.storage_provider === "supabase" || row.storage_provider === "google_drive" ? row.storage_provider : "unknown", fileName: row.file_name, fileType: row.file_type || "文件", fileSize: bytes(row.file_size), uploadedAt: row.uploaded_at || null, businessDate: related.businessDate, tenantName: related.tenant?.name || null, propertyName: related.property?.name || related.property?.address || null, roomName: related.room?.room_number || related.room?.name || null, categoryLabel, tenantId: related.tenantId, storageBucket: row.storage_bucket || "", storagePath: row.storage_path || null, providerFileId: row.provider_file_id || null };
}
export async function loadAttachmentInventory(ownerId: string) { const context = await loadContext(ownerId); return (await loadAllRows(ownerId)).map(({ table, row }) => inventoryItem(table, row, context)); }
export async function loadAttachmentCleanupCandidates(ownerId: string): Promise<AttachmentCleanupCandidate[]> {
  const context = await loadContext(ownerId); const byTenant = new Map<string, AttachmentRow[]>();
  for (const item of await loadAllRows(ownerId)) { if (item.table !== "contract_files") continue; const tenantId = relatedRecords(item.table, item.row, context).tenantId; if (tenantId) byTenant.set(tenantId, [...(byTenant.get(tenantId) || []), item.row]); }
  return context.tenants.filter(isMovedOut).flatMap((tenant) => { const rows = byTenant.get(tenant.id) || []; if (!rows.length) return []; const property = tenant.property_id ? context.properties.get(tenant.property_id) : null; const room = tenant.room_id ? context.rooms.get(tenant.room_id) : null; return [{ tenantId: tenant.id, tenantName: tenant.name || "未命名租客", propertyName: property?.name || property?.address || "未分类房源", roomName: room?.room_number || room?.name || "未分类房间", status: tenant.status || "", actualMoveOutDate: tenant.actual_move_out_date || null, attachmentCount: rows.length, bytes: rows.reduce((sum, row) => sum + bytes(row.file_size), 0), googleDriveCount: rows.filter((row) => row.storage_provider === "google_drive").length }]; });
}
async function deleteAttachmentRows(ownerId: string, rows: Array<{ table: AttachmentTable; row: AttachmentRow }>): Promise<AttachmentCleanupReport> {
  const admin = getSupabaseAdmin(); const report: AttachmentCleanupReport = { planned: rows.length, deleted: 0, failed: 0, skippedGoogleDrive: 0, releasedBytes: 0, unreleasedBytes: 0, errors: [] };
  for (const { table, row } of rows) { const size = bytes(row.file_size); if (row.storage_provider === "google_drive") { report.skippedGoogleDrive += 1; report.unreleasedBytes += size; report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: "Google Drive 附件需要人工处理，系统不会删除原文件。" }); continue; }
    if (!row.storage_bucket || !row.storage_path) { report.failed += 1; report.unreleasedBytes += size; report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: "缺少云端文件路径，未删除记录。" }); continue; }
    const storage = await admin.storage.from(row.storage_bucket).remove([row.storage_path]); if (storage.error) { report.failed += 1; report.unreleasedBytes += size; report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: `云端文件删除失败：${storage.error.message}` }); continue; }
    const metadata = await admin.from(table).delete().eq("id", row.id).eq("user_id", ownerId); if (metadata.error) { report.failed += 1; report.unreleasedBytes += size; report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: `附件记录删除失败；云端文件已删除，请人工核对：${metadata.error.message}` }); continue; }
    report.deleted += 1; report.releasedBytes += size;
  }
  return report;
}
export async function cleanupAttachmentIds(ownerId: string, attachmentIds: string[]) { const wanted = new Set(attachmentIds.filter(Boolean)); return deleteAttachmentRows(ownerId, (await loadAllRows(ownerId)).filter(({ row }) => wanted.has(row.id))); }
export async function cleanupTenantAttachments(ownerId: string, tenantIds: string[]) { const selected = new Set(tenantIds.filter(Boolean)); const context = await loadContext(ownerId); return deleteAttachmentRows(ownerId, (await loadAllRows(ownerId)).filter(({ table, row }) => table === "contract_files" && selected.has(relatedRecords(table, row, context).tenantId || ""))); }
