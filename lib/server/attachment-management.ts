import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calendarCutoffDate, evaluateCandidate, isContractCurrentlyActive, isTenantCandidateAttachmentTable, localCalendarDate } from "@/lib/attachment-management-rules";

type AttachmentTable = "contract_files" | "rent_payment_files" | "expense_files";

type AttachmentRow = {
  id: string;
  storage_provider: string | null;
  storage_bucket: string | null;
  file_name: string;
  file_type: string;
  file_size: number | null;
  uploaded_at: string | null;
  contract_id?: string | null;
  rent_payment_id?: string | null;
  expense_id?: string | null;
};

type TenantRow = {
  id: string;
  name: string;
  room_id: string | null;
  property_id: string | null;
  status: string | null;
  actual_move_out_date: string | null;
};

type ContractRow = { id: string; tenant_id: string | null; room_id: string | null; status: string | null; is_active?: boolean | null; end_date: string | null };
type PaymentRow = { id: string; tenant_id: string | null; room_id: string | null };
type ExpenseRow = { id: string };
type RoomRow = { id: string; name: string | null; room_number: string | null; property_id: string | null };
type PropertyRow = { id: string; name: string | null };

type TenantQueryRow = Omit<TenantRow, "actual_move_out_date"> & { actual_move_out_date?: string | null };

function safeSupabaseError(error: unknown) {
  const value = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  return {
    code: typeof value.code === "string" ? value.code : null,
    message: typeof value.message === "string" ? value.message.slice(0, 240) : null,
    details: typeof value.details === "string" ? value.details.slice(0, 240) : null,
    hint: typeof value.hint === "string" ? value.hint.slice(0, 240) : null
  };
}

async function runSummaryQuery<T>(stage: string, query: PromiseLike<{ data: T | null; error: unknown | null }>) {
  try {
    const result = await query;
    if (result.error) {
      console.error("[attachment-summary] query failed", JSON.stringify({ stage, error: safeSupabaseError(result.error) }));
      throw new Error("attachment summary query failed");
    }
    console.info("[attachment-summary] query ok", JSON.stringify({ stage }));
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "attachment summary query failed") throw error;
    console.error("[attachment-summary] query exception", JSON.stringify({ stage, error: safeSupabaseError(error) }));
    throw new Error("attachment summary query failed");
  }
}

export type AttachmentCandidate = {
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

export type AttachmentSummary = {
  generatedAt: string;
  supabase: {
    totalCount: number;
    totalBytes: number;
    byTable: Record<AttachmentTable, { count: number; bytes: number }>;
    byType: Record<"image" | "pdf" | "other", { count: number; bytes: number }>;
    inRent: { count: number; bytes: number };
    movedOut: { count: number; bytes: number };
  };
  googleDriveCount: number;
  candidates: { over3Months: { tenantCount: number; attachmentCount: number; bytes: number; tenants: AttachmentCandidate[]; skipped: AttachmentCandidate[] }; over6Months: { tenantCount: number; attachmentCount: number; bytes: number; tenants: AttachmentCandidate[]; skipped: AttachmentCandidate[] } };
};

const tables: AttachmentTable[] = ["contract_files", "rent_payment_files", "expense_files"];

async function loadTenants(admin: ReturnType<typeof getSupabaseAdmin>, workspaceOwnerId: string) {
  const withDate = await admin
    .from("tenants")
    .select("id,name,room_id,property_id,status,actual_move_out_date")
    .eq("user_id", workspaceOwnerId);
  if (!withDate.error) {
    console.info("[attachment-summary] query ok", JSON.stringify({ stage: "tenants" }));
    return (withDate.data || []) as TenantQueryRow[];
  }
  const error = safeSupabaseError(withDate.error);
  const missingColumn = error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST100" || /actual_move_out_date/i.test(error.message || "");
  if (!missingColumn) {
    console.error("[attachment-summary] query failed", JSON.stringify({ stage: "tenants", error }));
    throw new Error("attachment summary query failed");
  }
  console.warn("[attachment-summary] actual_move_out_date unavailable; using empty date fallback");
  const fallback = await runSummaryQuery("tenants_fallback_without_actual_move_out_date", admin
    .from("tenants")
    .select("id,name,room_id,property_id,status")
    .eq("user_id", workspaceOwnerId));
  return ((fallback.data || []) as TenantQueryRow[]).map((tenant) => ({ ...tenant, actual_move_out_date: null }));
}

function bytes(value: unknown) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function isImage(type: string) {
  return type.toLowerCase().startsWith("image/");
}

function isPdf(type: string) {
  return type.toLowerCase() === "application/pdf";
}

function candidateFor(tenant: TenantRow, roomById: Map<string, RoomRow>, propertyById: Map<string, PropertyRow>, contracts: ContractRow[], tenantFiles: Map<string, AttachmentRow[]>, months: number, cutoffDate: string, today: string): AttachmentCandidate {
  const tenantAttachments = tenantFiles.get(tenant.id) || [];
  const contractFiles = tenantAttachments.filter((row) => row.contract_id);
  const rentFiles = tenantAttachments.filter((row) => row.rent_payment_id);
  const roomRow = tenant.room_id ? roomById.get(tenant.room_id) : undefined;
  const property = tenant.property_id ? propertyById.get(tenant.property_id) : undefined;
  const room = roomRow ? `${property?.name || ""}${roomRow.name || roomRow.room_number || ""}`.trim() || roomRow.room_number || "" : "";
  const activeContract = contracts.some((row) => row.tenant_id === tenant.id && isContractCurrentlyActive({ status: row.status, isActive: row.is_active ?? null, endDate: row.end_date }, today));
  const decision = evaluateCandidate({ status: tenant.status, actualMoveOutDate: tenant.actual_move_out_date, hasActiveContract: activeContract }, cutoffDate);
  const skipReason = decision.eligible ? null : ({ invalid_move_out_date: "实际退租日期无法解析", missing_move_out_date: "没有实际退租日期", not_moved_out: "租客当前不是已退租", active_contract: "仍存在有效合同", not_old_enough: `未超过${months}个月` }[decision.reason]);
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    room,
    actualMoveOutDate: tenant.actual_move_out_date,
    contractCount: contractFiles.length,
    contractBytes: contractFiles.reduce((sum, row) => sum + bytes(row.file_size), 0),
    rentPaymentCount: rentFiles.length,
    rentPaymentBytes: rentFiles.reduce((sum, row) => sum + bytes(row.file_size), 0),
    attachmentCount: tenantAttachments.length,
    bytes: tenantAttachments.reduce((sum, row) => sum + bytes(row.file_size), 0),
    skipReason
  };
}

export async function loadAttachmentSummary(workspaceOwnerId: string): Promise<AttachmentSummary> {
  const admin = getSupabaseAdmin();
  const [propertyResult, roomResult, tenantResult, contractResult, paymentResult, expenseResult, ...attachmentResults] = await Promise.all([
    runSummaryQuery("properties", admin.from("properties").select("id,name").eq("user_id", workspaceOwnerId)),
    runSummaryQuery("rooms", admin.from("rooms").select("id,name,room_number,property_id").eq("user_id", workspaceOwnerId)),
    loadTenants(admin, workspaceOwnerId),
    runSummaryQuery("contracts", admin.from("contracts").select("id,tenant_id,room_id,status,end_date").eq("user_id", workspaceOwnerId)),
    runSummaryQuery("rent_payments", admin.from("rent_payments").select("id,tenant_id,room_id").eq("user_id", workspaceOwnerId)),
    runSummaryQuery("expenses", admin.from("expenses").select("id").eq("user_id", workspaceOwnerId)),
    runSummaryQuery("contract_files", admin.from("contract_files").select("id,storage_provider,storage_bucket,file_name,file_type,file_size,uploaded_at,contract_id").eq("user_id", workspaceOwnerId)),
    runSummaryQuery("rent_payment_files", admin.from("rent_payment_files").select("id,storage_provider,storage_bucket,file_name,file_type,file_size,uploaded_at,rent_payment_id").eq("user_id", workspaceOwnerId)),
    runSummaryQuery("expense_files", admin.from("expense_files").select("id,storage_provider,storage_bucket,file_name,file_type,file_size,uploaded_at,expense_id").eq("user_id", workspaceOwnerId))
  ]);
  const results = [propertyResult, roomResult, contractResult, paymentResult, expenseResult, ...attachmentResults];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error("附件统计读取失败。");
  const properties = (propertyResult.data || []) as PropertyRow[];
  const rooms = (roomResult.data || []) as RoomRow[];
  const tenants = tenantResult as TenantRow[];
  const contracts = (contractResult.data || []) as ContractRow[];
  const payments = (paymentResult.data || []) as PaymentRow[];
  const expenses = (expenseResult.data || []) as ExpenseRow[];
  const rowsByTable = new Map<AttachmentTable, AttachmentRow[]>(tables.map((table, index) => [table, (attachmentResults[index].data || []) as AttachmentRow[]]));
  const allRows = tables.flatMap((table) => rowsByTable.get(table) || []);
  const supabaseRows = allRows.filter((row) => row.storage_provider === "supabase");
  const googleDriveCount = allRows.filter((row) => row.storage_provider === "google_drive").length;
  const byTable = Object.fromEntries(tables.map((table) => {
    const rows = (rowsByTable.get(table) || []).filter((row) => row.storage_provider === "supabase");
    return [table, { count: rows.length, bytes: rows.reduce((sum, row) => sum + bytes(row.file_size), 0) }];
  })) as AttachmentSummary["supabase"]["byTable"];
  const byType = {
    image: { count: supabaseRows.filter((row) => isImage(row.file_type)).length, bytes: supabaseRows.filter((row) => isImage(row.file_type)).reduce((sum, row) => sum + bytes(row.file_size), 0) },
    pdf: { count: supabaseRows.filter((row) => isPdf(row.file_type)).length, bytes: supabaseRows.filter((row) => isPdf(row.file_type)).reduce((sum, row) => sum + bytes(row.file_size), 0) },
    other: { count: supabaseRows.filter((row) => !isImage(row.file_type) && !isPdf(row.file_type)).length, bytes: supabaseRows.filter((row) => !isImage(row.file_type) && !isPdf(row.file_type)).reduce((sum, row) => sum + bytes(row.file_size), 0) }
  };
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const tenantFiles = new Map<string, AttachmentRow[]>();
  for (const row of supabaseRows) {
    const table = row.contract_id ? "contract_files" : row.rent_payment_id ? "rent_payment_files" : "expense_files";
    if (!isTenantCandidateAttachmentTable(table)) continue;
    const tenantId = row.contract_id ? contractById.get(row.contract_id)?.tenant_id : row.rent_payment_id ? paymentById.get(row.rent_payment_id)?.tenant_id : null;
    if (tenantId) tenantFiles.set(tenantId, [...(tenantFiles.get(tenantId) || []), row]);
  }
  const today = localCalendarDate(new Date());
  if (!today) throw new Error("无法确定当前本地日期。");
  const candidatesForMonths = (months: number) => {
    const cutoff = calendarCutoffDate(new Date(), months);
    return tenants.map((tenant) => candidateFor(tenant, roomById, propertyById, contracts, tenantFiles, months, cutoff, today)).filter((item) => item.attachmentCount > 0);
  };
  const over3 = candidatesForMonths(3);
  const over6 = candidatesForMonths(6);
  const aggregate = (items: AttachmentCandidate[]) => {
    const eligible = items.filter((item) => !item.skipReason);
    return { tenantCount: eligible.length, attachmentCount: eligible.reduce((sum, item) => sum + item.attachmentCount, 0), bytes: eligible.reduce((sum, item) => sum + item.bytes, 0), tenants: eligible, skipped: items.filter((item) => Boolean(item.skipReason)) };
  };
  const inRentTenantIds = new Set(tenants.filter((tenant) => tenant.status === "在租").map((tenant) => tenant.id));
  const movedOutTenantIds = new Set(tenants.filter((tenant) => tenant.status === "已退租").map((tenant) => tenant.id));
  const tenantFileStats = (ids: Set<string>) => supabaseRows.filter((row) => {
    const tenantId = row.contract_id ? contractById.get(row.contract_id)?.tenant_id : row.rent_payment_id ? paymentById.get(row.rent_payment_id)?.tenant_id : null;
    return Boolean(tenantId && ids.has(tenantId));
  });
  const inRentRows = tenantFileStats(inRentTenantIds);
  const movedOutRows = tenantFileStats(movedOutTenantIds);
  return {
    generatedAt: new Date().toISOString(),
    supabase: {
      totalCount: supabaseRows.length,
      totalBytes: supabaseRows.reduce((sum, row) => sum + bytes(row.file_size), 0),
      byTable,
      byType,
      inRent: { count: inRentRows.length, bytes: inRentRows.reduce((sum, row) => sum + bytes(row.file_size), 0) },
      movedOut: { count: movedOutRows.length, bytes: movedOutRows.reduce((sum, row) => sum + bytes(row.file_size), 0) }
    },
    googleDriveCount,
    candidates: { over3Months: aggregate(over3), over6Months: aggregate(over6) }
  };
}
