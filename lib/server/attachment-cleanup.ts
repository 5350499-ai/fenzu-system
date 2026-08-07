import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AttachmentTable = "contract_files" | "rent_payment_files";

type AttachmentRow = {
  id: string;
  user_id: string;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string;
  file_size: number | null;
  tenant_id?: string | null;
  rent_payment_id?: string | null;
};

type TenantRow = {
  id: string;
  name: string | null;
  status: string | null;
  actual_move_out_date?: string | null;
  property_id: string | null;
  room_id: string | null;
};

export type AttachmentCleanupCandidate = {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  roomName: string;
  status: string;
  actualMoveOutDate: string | null;
  attachmentCount: number;
  bytes: number;
  googleDriveCount: number;
};

export type AttachmentCleanupError = {
  attachmentId: string;
  fileName: string;
  reason: string;
};

export type AttachmentCleanupReport = {
  planned: number;
  deleted: number;
  failed: number;
  skippedGoogleDrive: number;
  releasedBytes: number;
  unreleasedBytes: number;
  errors: AttachmentCleanupError[];
};

function bytes(value: number | null | undefined) {
  return Math.max(0, Number(value || 0));
}

function isMovedOut(tenant: TenantRow) {
  return Boolean(tenant.actual_move_out_date) || /退租|moved[_ -]?out|inactive|closed/i.test(tenant.status || "");
}

async function loadTenantAttachments(ownerId: string, tenantId: string) {
  const admin = getSupabaseAdmin();
  const contracts = await admin
    .from("contract_files")
    .select("id,user_id,storage_provider,storage_bucket,storage_path,file_name,file_size,tenant_id")
    .eq("user_id", ownerId)
    .eq("tenant_id", tenantId);
  if (contracts.error) throw new Error(`读取合同附件失败：${contracts.error.message}`);

  const payments = await admin.from("rent_payments").select("id").eq("user_id", ownerId).eq("tenant_id", tenantId);
  if (payments.error) throw new Error(`读取收款记录失败：${payments.error.message}`);

  const paymentIds = (payments.data || []).map((row) => row.id);
  let rentFiles: AttachmentRow[] = [];
  if (paymentIds.length) {
    const result = await admin
      .from("rent_payment_files")
      .select("id,user_id,storage_provider,storage_bucket,storage_path,file_name,file_size,rent_payment_id")
      .eq("user_id", ownerId)
      .in("rent_payment_id", paymentIds);
    if (result.error) throw new Error(`读取收款附件失败：${result.error.message}`);
    rentFiles = (result.data || []) as AttachmentRow[];
  }

  return {
    admin,
    rows: [...((contracts.data || []) as AttachmentRow[]), ...rentFiles]
  };
}

async function loadTenants(ownerId: string) {
  const admin = getSupabaseAdmin();
  const result = await admin
    .from("tenants")
    .select("id,name,status,actual_move_out_date,property_id,room_id")
    .eq("user_id", ownerId);
  if (!result.error) return (result.data || []) as TenantRow[];

  // Keep compatibility with installations that predate actual_move_out_date.
  if (!/actual_move_out_date|column|schema cache/i.test(result.error.message)) throw new Error(`读取租客失败：${result.error.message}`);
  const fallback = await admin.from("tenants").select("id,name,status,property_id,room_id").eq("user_id", ownerId);
  if (fallback.error) throw new Error(`读取租客失败：${fallback.error.message}`);
  return ((fallback.data || []) as TenantRow[]).map((tenant) => ({ ...tenant, actual_move_out_date: null }));
}

async function loadContext(ownerId: string) {
  const admin = getSupabaseAdmin();
  const [tenants, properties, rooms] = await Promise.all([
    loadTenants(ownerId),
    admin.from("properties").select("id,name,address").eq("user_id", ownerId),
    admin.from("rooms").select("id,name,room_number").eq("user_id", ownerId)
  ]);
  if (properties.error) throw new Error(`读取房源失败：${properties.error.message}`);
  if (rooms.error) throw new Error(`读取房间失败：${rooms.error.message}`);
  return {
    tenants,
    propertyById: new Map((properties.data || []).map((row) => [row.id, row.name || row.address || "未命名房源"])),
    roomById: new Map((rooms.data || []).map((row) => [row.id, row.room_number || row.name || "未命名房间"]))
  };
}

export async function loadAttachmentCleanupCandidates(ownerId: string): Promise<AttachmentCleanupCandidate[]> {
  const context = await loadContext(ownerId);
  const candidates: AttachmentCleanupCandidate[] = [];
  for (const tenant of context.tenants) {
    if (!isMovedOut(tenant)) continue;
    const { rows } = await loadTenantAttachments(ownerId, tenant.id);
    if (!rows.length) continue;
    candidates.push({
      tenantId: tenant.id,
      tenantName: tenant.name || "未命名租客",
      propertyName: context.propertyById.get(tenant.property_id || "") || "未分类房源",
      roomName: context.roomById.get(tenant.room_id || "") || "未分类房间",
      status: tenant.status || "",
      actualMoveOutDate: tenant.actual_move_out_date || null,
      attachmentCount: rows.length,
      bytes: rows.reduce((total, row) => total + bytes(row.file_size), 0),
      googleDriveCount: rows.filter((row) => row.storage_provider === "google_drive").length
    });
  }
  return candidates;
}

export async function cleanupTenantAttachments(ownerId: string, tenantId: string): Promise<AttachmentCleanupReport> {
  const { admin, rows } = await loadTenantAttachments(ownerId, tenantId);
  const report: AttachmentCleanupReport = { planned: rows.length, deleted: 0, failed: 0, skippedGoogleDrive: 0, releasedBytes: 0, unreleasedBytes: 0, errors: [] };

  for (const row of rows) {
    const size = bytes(row.file_size);
    if (row.storage_provider === "google_drive") {
      report.skippedGoogleDrive += 1;
      report.unreleasedBytes += size;
      report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: "Google Drive 附件需人工处理，系统未删除。" });
      continue;
    }
    if (!row.storage_bucket || !row.storage_path) {
      report.failed += 1;
      report.unreleasedBytes += size;
      report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: "缺少云端文件路径，未删除记录。" });
      continue;
    }

    const storage = await admin.storage.from(row.storage_bucket).remove([row.storage_path]);
    if (storage.error) {
      report.failed += 1;
      report.unreleasedBytes += size;
      report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: `云端文件删除失败：${storage.error.message}` });
      continue;
    }

    const table: AttachmentTable = row.rent_payment_id ? "rent_payment_files" : "contract_files";
    const metadata = await admin.from(table).delete().eq("id", row.id).eq("user_id", ownerId);
    if (metadata.error) {
      report.failed += 1;
      report.unreleasedBytes += size;
      report.errors.push({ attachmentId: row.id, fileName: row.file_name, reason: `附件记录删除失败；云端文件已删除，请人工核对：${metadata.error.message}` });
      continue;
    }

    report.deleted += 1;
    report.releasedBytes += size;
  }

  return report;
}
