import { NextResponse } from "next/server";
import { emptyModulePermissions } from "@/lib/account-permissions";
import { apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";
import { clientSensitivePermissions } from "@/lib/server/account-management";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createDataExportPayload,
  dryRunRestore,
  isDataExportPayload,
  type DataExportPayload
} from "@/lib/data-export";

const BACKUP_BUCKET = "system-backups";

function beforeRestoreFailure(error: unknown, stage: string, context: {
  bucket?: string;
  objectPath?: string;
  mimeType?: string;
  workspaceId?: string;
  ownerId?: string;
  schema?: string;
  table?: string;
  recordCount?: number;
  storageResponse?: unknown;
  supabaseResponse?: unknown;
}) {
  const source = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const nested = (source.supabaseResponse && typeof source.supabaseResponse === "object" ? source.supabaseResponse : {}) as Record<string, unknown>;
  const message = text(nested.message || nested.error || source.message || source.error, error instanceof Error ? error.message : "BeforeRestore 生成失败");
  return {
    error: "BeforeRestore 生成失败",
    code: text(nested.code || source.code || source.name, "before_restore_failed"),
    message,
    details: nullableText(nested.details || source.details),
    hint: nullableText(nested.hint || source.hint),
    sqlState: text(nested.code || source.sqlState || source.code, ""),
    stack: error instanceof Error ? error.stack || null : nullableText(source.stack),
    stage,
    schema: context.schema || nullableText(source.schema) || "public",
    table: context.table || nullableText(source.table),
    recordCount: context.recordCount ?? (typeof source.recordCount === "number" ? source.recordCount : null),
    bucket: context.bucket || null,
    objectPath: context.objectPath || null,
    mimeType: context.mimeType || "application/json",
    workspaceId: context.workspaceId || null,
    ownerId: context.ownerId || null,
    storageResponse: context.storageResponse || source.storageResponse || null,
    supabaseResponse: context.supabaseResponse || source.supabaseResponse || null
  };
}

function logBeforeRestoreFailure(diagnostic: ReturnType<typeof beforeRestoreFailure>) {
  console.error("BeforeRestore failed", diagnostic);
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function nullableText(value: unknown) { const result = text(value); return result || null; }
function nullableUuid(value: unknown) {
  const result = nullableText(value);
  if (!result) return null;
  const normalized = result.toLowerCase();
  return normalized === "null" || normalized === "undefined" ? null : result;
}
function date(value: unknown) { return nullableText(value); }
function monthDate(value: unknown) {
  const raw = nullableText(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw;
}
function numberValue(value: unknown, fallback = 0) { return typeof value === "number" && Number.isFinite(value) ? value : Number(value || fallback); }
function booleanValue(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function iso(value: unknown) { return text(value) || new Date().toISOString(); }

// Restore must target the live table contract, not legacy columns that may still
// exist in older Backup V1 files or compatibility mappings. Unknown keys are
// intentionally preserved in the backup file, but are not sent to
// jsonb_populate_recordset because PostgreSQL ignores them and the final
// field-level validation cannot treat them as restored columns.
const RESTORE_TABLE_COLUMNS = {
  properties: ["id", "user_id", "name", "address", "city", "landlord_name", "property_type", "sublet_allowed", "notes", "occupancy_tracking_start_date", "created_at", "updated_at"],
  rooms: ["id", "user_id", "property_id", "name", "room_number", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at"],
  tenants: ["id", "user_id", "property_id", "room_id", "name", "phone", "email", "wechat", "source", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at", "payment_day", "actual_move_out_date"],
  contracts: ["id", "user_id", "property_id", "room_id", "tenant_id", "monthly_rent", "deposit_amount", "start_date", "end_date", "status", "notes", "created_at", "updated_at"],
  rentPayments: ["id", "user_id", "tenant_id", "property_id", "room_id", "rent_month", "amount_due", "amount_paid", "amount_unpaid", "payment_date", "payment_method", "is_overdue", "notes", "created_at", "updated_at", "received_by", "coverage_start_date", "coverage_end_date", "payment_status", "income_type", "income_item"],
  expenses: ["id", "user_id", "property_id", "room_id", "expense_month", "category", "amount", "payment_date", "payment_method", "paid_by", "is_paid", "notes", "created_at", "updated_at"],
  deposits: ["id", "user_id", "tenant_id", "property_id", "room_id", "transaction_type", "amount", "transaction_date", "status", "notes", "created_at", "updated_at", "received_by", "paid_by"],
  viewingAppointments: ["id", "user_id", "property_id", "room_id", "appointment_date", "appointment_time", "contact_name", "contact_whatsapp", "contact_phone", "status", "notes", "created_at", "updated_at"],
  tasks: ["id", "user_id", "task_type", "title", "description", "due_date", "status", "priority", "property_id", "room_id", "tenant_id", "contract_id", "rent_payment_id", "deposit_id", "notes", "created_at", "updated_at"],
  partners: ["id", "workspace_owner_id", "legacy_code", "display_name", "color_key", "sort_order", "is_active", "linked_account_id", "created_at", "updated_at"],
  partnerShares: ["id", "workspace_owner_id", "property_id", "partner_id", "percentage", "effective_from", "effective_to", "created_at", "updated_at"],
  partnerNameHistory: ["id", "workspace_owner_id", "partner_id", "old_display_name", "new_display_name", "changed_at", "changed_by_account_id", "created_at"],
  settlementBatches: ["id", "workspace_owner_id", "property_id", "period_start", "period_end", "status", "total_income", "total_expense", "net_profit", "currency", "confirmed_at", "confirmed_by_account_id", "reversed_at", "reversed_by_account_id", "reversal_reason", "note", "created_at", "updated_at", "property_name_snapshot", "confirmed_by_display_name_snapshot", "income_details_snapshot", "expense_details_snapshot"],
  settlementPartnerSnapshots: ["id", "settlement_batch_id", "partner_id", "partner_display_name_snapshot", "legacy_code_snapshot", "actual_collected", "actual_paid", "actual_retained", "profit_entitlement", "settlement_balance", "share_segments_snapshot", "created_at"],
  settlementSegmentSnapshots: ["id", "settlement_batch_id", "segment_start", "segment_end", "total_income", "total_expense", "net_profit", "shares_snapshot", "created_at"],
  settlementTransferSnapshots: ["id", "settlement_batch_id", "from_partner_id", "to_partner_id", "from_name_snapshot", "to_name_snapshot", "amount", "currency", "created_at"]
} as const;

function projectRestoreRows<T extends Record<string, unknown>>(rowsToProject: T[], columns: readonly string[]) {
  return rowsToProject.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
}

function projectRestoreData(data: Record<string, unknown>) {
  const projected = { ...data } as Record<string, unknown>;
  for (const [key, columns] of Object.entries(RESTORE_TABLE_COLUMNS)) {
    projected[key] = projectRestoreRows(rows(data[key]), columns);
  }
  return projected;
}

function toCamelKey(key: string) { return key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase()); }
function toExportRows(value: unknown) {
  return rows(value).map((row) => Object.fromEntries(Object.entries(row).map(([key, item]) => [toCamelKey(key), item])));
}

async function readRows(admin: ReturnType<typeof getSupabaseAdmin>, table: string, ownerColumn: string, ownerId: string) {
  const { data, error } = await admin.from(table).select("*").eq(ownerColumn, ownerId);
  if (error) {
    const failure = new Error(`读取表 ${table} 失败`);
    Object.assign(failure, { stage: "database_read", schema: "public", table, recordCount: 0, supabaseResponse: error });
    throw failure;
  }
  return data || [];
}

async function readBeforeRestoreTable<T extends { data: unknown; error: unknown }>(table: string, query: PromiseLike<T>) {
  const result = await query;
  if (result.error) {
    const failure = new Error(`读取表 ${table} 失败`);
    Object.assign(failure, { stage: "database_read", schema: "public", table, recordCount: 0, supabaseResponse: result.error });
    throw failure;
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function loadServerBackupData(admin: ReturnType<typeof getSupabaseAdmin>, ownerId: string) {
  const [properties, rooms, tenants, contracts, rentPayments, expenses, deposits, viewingAppointments, tasks, partners, partnerShares, partnerNameHistory, settlementBatches] = await Promise.all([
    readRows(admin, "properties", "user_id", ownerId), readRows(admin, "rooms", "user_id", ownerId), readRows(admin, "tenants", "user_id", ownerId),
    readRows(admin, "contracts", "user_id", ownerId), readRows(admin, "rent_payments", "user_id", ownerId), readRows(admin, "expenses", "user_id", ownerId),
    readRows(admin, "deposits", "user_id", ownerId), readRows(admin, "viewing_appointments", "user_id", ownerId), readRows(admin, "tasks", "user_id", ownerId),
    readRows(admin, "partners", "workspace_owner_id", ownerId), readRows(admin, "partner_property_shares", "workspace_owner_id", ownerId), readRows(admin, "partner_name_history", "workspace_owner_id", ownerId),
    readRows(admin, "partner_settlement_batches", "workspace_owner_id", ownerId)
  ]);
  const batchIds = settlementBatches.map((batch) => String(batch.id));
  const partnerSnapshots = { data: batchIds.length ? await readBeforeRestoreTable("partner_settlement_partner_snapshots", admin.from("partner_settlement_partner_snapshots").select("*").in("settlement_batch_id", batchIds)) : [] };
  const segmentSnapshots = { data: batchIds.length ? await readBeforeRestoreTable("partner_settlement_segment_snapshots", admin.from("partner_settlement_segment_snapshots").select("*").in("settlement_batch_id", batchIds)) : [] };
  const transferSnapshots = { data: batchIds.length ? await readBeforeRestoreTable("partner_settlement_transfer_snapshots", admin.from("partner_settlement_transfer_snapshots").select("*").in("settlement_batch_id", batchIds)) : [] };
  const group = (items: Array<Record<string, unknown>>) => items.reduce((map, row) => {
    const key = String(row.settlement_batch_id); const list = map.get(key) || []; list.push(row); map.set(key, list); return map;
  }, new Map<string, Record<string, unknown>[]>());
  const partnerByBatch = group((partnerSnapshots.data || []) as Array<Record<string, unknown>>);
  const segmentByBatch = group((segmentSnapshots.data || []) as Array<Record<string, unknown>>);
  const transferByBatch = group((transferSnapshots.data || []) as Array<Record<string, unknown>>);
  const profilesResult = { data: await readBeforeRestoreTable("user_profiles", admin.from("user_profiles").select("auth_user_id,username,display_name,account_type,status,property_access_mode,must_change_password,last_login_at,last_activity_at,disabled_at").eq("workspace_owner_id", ownerId).order("created_at", { ascending: true })) };
  const permissionsResult = { data: await readBeforeRestoreTable("user_permissions", admin.from("user_permissions").select("user_id,module_key,can_view,can_create,can_edit,can_archive,can_delete")) };
  const sensitiveResult = { data: await readBeforeRestoreTable("user_sensitive_permissions", admin.from("user_sensitive_permissions").select("*")) };
  const accessResult = { data: await readBeforeRestoreTable("user_property_access", admin.from("user_property_access").select("user_id,property_id")) };
  const identitiesResult = { data: await readBeforeRestoreTable("account_auth_identities", admin.from("account_auth_identities").select("auth_user_id,auth_email,is_internal_email")) };
  const auditResult = { data: await readBeforeRestoreTable("audit_logs", admin.from("audit_logs").select("id,log_category,actor_user_id,actor_username,actor_display_name,action_type,module_key,entity_type,entity_id,before_data,after_data,description,success,created_at").eq("success", true).order("created_at", { ascending: false }).limit(1000)) };
  const profiles = (profilesResult.data || []) as Array<Record<string, unknown>>;
  const userIds = new Set(profiles.map((profile) => String(profile.auth_user_id)));
  const permissions = (permissionsResult.data || []) as Array<Record<string, unknown>>;
  const sensitiveByUser = new Map((sensitiveResult.data || []).map((row) => [String(row.user_id), row as Record<string, boolean>]));
  const accessByUser = new Map<string, string[]>();
  (accessResult.data || []).forEach((row) => {
    const userId = String(row.user_id);
    if (!userIds.has(userId)) return;
    accessByUser.set(userId, [...(accessByUser.get(userId) || []), String(row.property_id)]);
  });
  const identityByUser = new Map((identitiesResult.data || []).map((row) => [String(row.auth_user_id), row as { auth_email?: string; is_internal_email?: boolean }]));
  const latestAction = new Map<string, string>();
  const auditLogs = (auditResult.data || []).filter((row) => !row.actor_user_id || userIds.has(String(row.actor_user_id))).map((row) => toExportRows([row])[0]);
  auditLogs.forEach((row) => {
    const actorId = text(row.actorUserId);
    if (actorId && !latestAction.has(actorId)) latestAction.set(actorId, text(row.createdAt));
  });
  const accounts = profiles.map((profile) => {
    const userId = String(profile.auth_user_id);
    const permissionRows = new Map(permissions.filter((row) => String(row.user_id) === userId).map((row) => [String(row.module_key), row]));
    const identity = identityByUser.get(userId);
    return {
      id: userId,
      username: profile.username,
      displayName: profile.display_name,
      accountType: profile.account_type,
      status: profile.status,
      propertyAccessMode: profile.property_access_mode,
      propertyIds: accessByUser.get(userId) || [],
      mustChangePassword: profile.must_change_password,
      lastLoginAt: profile.last_login_at,
      lastActivityAt: profile.last_activity_at,
      latestActionAt: latestAction.get(userId) || null,
      email: identity?.is_internal_email ? null : identity?.auth_email || null,
      emailBound: Boolean(identity && !identity.is_internal_email),
      disabledAt: profile.disabled_at,
      modulePermissions: emptyModulePermissions().map((base) => {
        const row = permissionRows.get(base.moduleKey);
        return { moduleKey: base.moduleKey, canView: Boolean(row?.can_view), canCreate: Boolean(row?.can_create), canEdit: Boolean(row?.can_edit), canArchive: Boolean(row?.can_archive), canDelete: Boolean(row?.can_delete) };
      }),
      sensitivePermissions: clientSensitivePermissions(sensitiveByUser.get(userId) || null)
    };
  });
  return {
    properties: toExportRows(properties), rooms: toExportRows(rooms), tenants: toExportRows(tenants), contracts: toExportRows(contracts), rentPayments: toExportRows(rentPayments), expenses: toExportRows(expenses), deposits: toExportRows(deposits), viewingAppointments: toExportRows(viewingAppointments), tasks: toExportRows(tasks), partners: toExportRows(partners), partnerShares: toExportRows(partnerShares), partnerNameHistory: toExportRows(partnerNameHistory), propertyHistory: [],
    settlementBatches: toExportRows(settlementBatches), settlementSnapshots: settlementBatches.map((batch) => ({ batch: toExportRows([batch])[0], partners: toExportRows(partnerByBatch.get(String(batch.id)) || []), segments: toExportRows(segmentByBatch.get(String(batch.id)) || []), transfers: toExportRows(transferByBatch.get(String(batch.id)) || []) })), accounts, auditLogs, settings: { legacyPartnerRatios: { A: 50, B: 50 } }
  };
}

function restoreDiagnostic(error: unknown, dryRun: Record<string, unknown> | null) {
  const source = (error && typeof error === "object" ? error : dryRun || {}) as Record<string, unknown>;
  const message = text(source.message || source.error, "Restore transaction failed");
  const details = nullableText(source.details);
  const hint = nullableText(source.hint);
  const code = text(source.code || source.errorCode, "restore_dry_run_failed");
  const haystack = `${code} ${message} ${details || ""}`.toLowerCase();
  const failureStage = text(source.failureStage) || (haystack.includes("foreign key") || code === "23503" ? "外键校验" : haystack.includes("unique") || code === "23505" ? "唯一键校验" : haystack.includes("json") ? "JSON格式校验" : "restore_transaction");
  return {
    error: "Restore Dry Run 失败",
    code,
    stack: error instanceof Error ? error.stack || null : nullableText(source.stack),
    message,
    details,
    hint,
    sqlState: code,
    context: nullableText(source.context),
    table: nullableText(source.table),
    column: nullableText(source.column),
    constraint: nullableText(source.constraint),
    recordId: nullableText(source.recordId),
    failureStage
  };
}

function normalizeRestoreData(payload: DataExportPayload, workspaceOwnerId: string) {
  const source = payload.data;
  const properties = rows(source.properties).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, name: text(row.name), address: text(row.address), city: text(row.city),
    landlord_name: nullableText(row.landlord_name ?? row.landlordName), property_type: nullableText(row.property_type ?? row.propertyType), sublet_allowed: booleanValue(row.sublet_allowed ?? row.subletAllowed), notes: nullableText(row.notes),
    occupancy_tracking_start_date: date(row.occupancy_tracking_start_date ?? row.occupancyTrackingStartDate), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const rooms = rows(source.rooms).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: nullableUuid(row.property_id ?? row.propertyId), name: text(row.name), room_number: nullableText(row.room_number ?? row.roomNumber),
    monthly_rent: numberValue(row.monthly_rent ?? row.monthlyRent), deposit_amount: numberValue(row.deposit_amount ?? row.depositAmount), status: text(row.status, "vacant"),
    area: row.area == null ? null : numberValue(row.area), has_window: booleanValue(row.has_window ?? row.hasWindow), has_private_bathroom: booleanValue(row.has_private_bathroom ?? row.hasPrivateBathroom), furniture: nullableText(row.furniture), notes: nullableText(row.notes), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const tenants = rows(source.tenants).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId), name: text(row.name),
    phone: nullableText(row.phone), email: nullableText(row.email), wechat: nullableText(row.wechat), whatsapp: nullableText(row.whatsapp), passport_number: nullableText(row.passport_number ?? row.passportNumber), nie_number: nullableText(row.nie_number ?? row.nieNumber),
    nationality: nullableText(row.nationality), source: nullableText(row.source), move_in_date: date(row.move_in_date ?? row.moveInDate), expected_move_out_date: date(row.expected_move_out_date ?? row.expectedMoveOutDate),
    actual_move_out_date: date(row.actual_move_out_date ?? row.actualMoveOutDate), monthly_rent: numberValue(row.monthly_rent ?? row.monthlyRent), deposit_amount: numberValue(row.deposit_amount ?? row.depositAmount),
    key_count: row.key_count == null && row.keyCount == null ? 0 : numberValue(row.key_count ?? row.keyCount), payment_day: row.payment_day == null && row.paymentDay == null ? 20 : numberValue(row.payment_day ?? row.paymentDay, 20), status: text(row.status, "active"), notes: nullableText(row.notes),
    created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const contracts = rows(source.contracts).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, contract_type: text(row.contract_type ?? row.contractType, "tenant_contract"), property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId),
    tenant_id: nullableUuid(row.tenant_id ?? row.tenantId), landlord_id: nullableUuid(row.landlord_id ?? row.landlordId), monthly_rent: numberValue(row.monthly_rent ?? row.monthlyRent), deposit_amount: numberValue(row.deposit_amount ?? row.depositAmount),
    start_date: date(row.start_date ?? row.startDate), end_date: date(row.end_date ?? row.endDate), is_signed: booleanValue(row.is_signed ?? row.isSigned), is_active: row.is_active == null && row.isActive == null ? text(row.status) !== "ended" : booleanValue(row.is_active ?? row.isActive), status: text(row.status, "active"),
    file_url: nullableText(row.file_url ?? row.fileUrl), storage_path: nullableText(row.storage_path ?? row.storagePath), notes: nullableText(row.notes), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const rentPayments = rows(source.rentPayments).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, tenant_id: nullableUuid(row.tenant_id ?? row.tenantId), property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId),
    rent_month: monthDate(row.rent_month ?? row.rentMonth) || "1970-01-01", amount_due: numberValue(row.amount_due ?? row.amountDue), amount_paid: numberValue(row.amount_paid ?? row.amountPaid), amount_unpaid: numberValue(row.amount_unpaid ?? row.amountUnpaid),
    payment_date: date(row.payment_date ?? row.paymentDate), payment_method: nullableText(row.payment_method ?? row.paymentMethod), is_overdue: booleanValue(row.is_overdue ?? row.isOverdue), notes: nullableText(row.notes),
    created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt), received_by: nullableText(row.received_by ?? row.receivedBy) || "A", paid_by: nullableText(row.paid_by ?? row.paidBy),
    payment_status: nullableText(row.payment_status ?? row.paymentStatus) || (numberValue(row.amount_paid ?? row.amountPaid) > 0 ? "已收" : "未收"), income_type: nullableText(row.income_type ?? row.incomeType) || "房租收入",
    income_item: nullableText(row.income_item ?? row.incomeItem), coverage_start_date: date(row.coverage_start_date ?? row.coverageStartDate), coverage_end_date: date(row.coverage_end_date ?? row.coverageEndDate)
  }));
  const expenses = rows(source.expenses).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId), expense_month: monthDate(row.expense_month ?? row.expenseMonth) || "1970-01-01",
    category: text(row.category, "其他"), amount: numberValue(row.amount), payment_date: date(row.payment_date ?? row.paymentDate), payment_method: nullableText(row.payment_method ?? row.paymentMethod),
    paid_by: nullableText(row.paid_by ?? row.paidBy) || "A", is_paid: booleanValue(row.is_paid ?? row.isPaid), notes: nullableText(row.notes), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const deposits = rows(source.deposits).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, tenant_id: nullableUuid(row.tenant_id ?? row.tenantId), property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId),
    transaction_type: text(row.transaction_type ?? row.transactionType ?? row.type, "收取"), amount: numberValue(row.amount), transaction_date: date(row.transaction_date ?? row.transactionDate), status: text(row.status, "已收"),
    notes: nullableText(row.notes), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt), received_by: nullableText(row.received_by ?? row.receivedBy) || "A", paid_by: nullableText(row.paid_by ?? row.paidBy) || "A"
  }));
  const viewingAppointments = rows(source.viewingAppointments).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId), appointment_date: text(row.appointment_date ?? row.appointmentDate),
    appointment_time: text(row.appointment_time ?? row.appointmentTime), contact_name: nullableText(row.contact_name ?? row.contactName), contact_whatsapp: nullableText(row.contact_whatsapp ?? row.contactWhatsapp), contact_phone: nullableText(row.contact_phone ?? row.contactPhone),
    status: text(row.status, "待看房"), notes: nullableText(row.notes), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const tasks = rows(source.tasks).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, task_type: text(row.task_type ?? row.taskType, "manual"), title: text(row.title), description: nullableText(row.description), due_date: date(row.due_date ?? row.dueDate),
    status: text(row.status, "待处理"), priority: text(row.priority, "普通"), property_id: nullableUuid(row.property_id ?? row.propertyId), room_id: nullableUuid(row.room_id ?? row.roomId), tenant_id: nullableUuid(row.tenant_id ?? row.tenantId),
    contract_id: nullableUuid(row.contract_id ?? row.contractId), rent_payment_id: nullableUuid(row.rent_payment_id ?? row.rentPaymentId), deposit_id: nullableUuid(row.deposit_id ?? row.depositId), completed_at: date(row.completed_at ?? row.completedAt), notes: nullableText(row.notes), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const partners = rows(source.partners).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, legacy_code: nullableText(row.legacy_code ?? row.legacyCode), display_name: text(row.display_name ?? row.displayName), color_key: nullableText(row.color_key ?? row.colorKey),
    sort_order: numberValue(row.sort_order ?? row.sortOrder), is_active: booleanValue(row.is_active ?? row.isActive, true), linked_account_id: nullableUuid(row.linked_account_id ?? row.linkedAccountId), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const partnerShares = rows(source.partnerShares).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, property_id: nullableUuid(row.property_id ?? row.propertyId), partner_id: nullableUuid(row.partner_id ?? row.partnerId), percentage: numberValue(row.percentage),
    effective_from: date(row.effective_from ?? row.effectiveFrom), effective_to: date(row.effective_to ?? row.effectiveTo), created_at: iso(row.created_at ?? row.createdAt), updated_at: iso(row.updated_at ?? row.updatedAt)
  }));
  const partnerNameHistory = rows(source.partnerNameHistory).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, partner_id: nullableUuid(row.partner_id ?? row.partnerId), old_display_name: text(row.old_display_name ?? row.oldDisplayName), new_display_name: text(row.new_display_name ?? row.newDisplayName),
    changed_at: iso(row.changed_at ?? row.changedAt), changed_by_account_id: nullableUuid(row.changed_by_account_id ?? row.changedByAccountId), created_at: iso(row.created_at ?? row.createdAt)
  }));
  const settlementBatches = rows(source.settlementBatches).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, property_id: nullableUuid(row.property_id ?? row.propertyId), period_start: text(row.period_start || row.periodStart), period_end: text(row.period_end || row.periodEnd),
    status: text(row.status, "confirmed"), total_income: numberValue(row.total_income ?? row.totalIncome), total_expense: numberValue(row.total_expense ?? row.totalExpense), net_profit: numberValue(row.net_profit ?? row.netProfit),
    currency: text(row.currency, "EUR"), confirmed_at: iso(row.confirmed_at || row.confirmedAt), confirmed_by_account_id: nullableUuid(row.confirmed_by_account_id || row.confirmedByAccountId),
    reversed_at: date(row.reversed_at || row.reversedAt), reversed_by_account_id: nullableUuid(row.reversed_by_account_id || row.reversedByAccountId), reversal_reason: nullableText(row.reversal_reason || row.reversalReason), note: nullableText(row.note),
    created_at: iso(row.created_at || row.createdAt), updated_at: iso(row.updated_at || row.updatedAt), property_name_snapshot: nullableText(row.property_name_snapshot || row.propertyNameSnapshot), confirmed_by_display_name_snapshot: nullableText(row.confirmed_by_display_name_snapshot || row.confirmedByDisplayNameSnapshot), income_details_snapshot: row.income_details_snapshot || row.incomeDetailsSnapshot || [], expense_details_snapshot: row.expense_details_snapshot || row.expenseDetailsSnapshot || []
  }));
  const snapshotRows = rows(source.settlementSnapshots);
  const settlementPartnerSnapshots = snapshotRows.flatMap((snapshot) => rows(snapshot.partners).map((row) => ({
    id: text(row.id),
    settlement_batch_id: nullableUuid(row.settlement_batch_id ?? row.settlementBatchId ?? (snapshot.batch as Record<string, unknown> | undefined)?.id),
    partner_id: nullableUuid(row.partner_id ?? row.partnerId),
    partner_display_name_snapshot: text(row.partner_display_name_snapshot ?? row.partnerDisplayNameSnapshot),
    legacy_code_snapshot: nullableText(row.legacy_code_snapshot ?? row.legacyCodeSnapshot),
    actual_collected: numberValue(row.actual_collected ?? row.actualCollected),
    actual_paid: numberValue(row.actual_paid ?? row.actualPaid),
    actual_retained: numberValue(row.actual_retained ?? row.actualRetained),
    profit_entitlement: numberValue(row.profit_entitlement ?? row.profitEntitlement),
    settlement_balance: numberValue(row.settlement_balance ?? row.settlementBalance),
    share_segments_snapshot: row.share_segments_snapshot ?? row.shareSegmentsSnapshot ?? [],
    created_at: iso(row.created_at ?? row.createdAt)
  })));
  const settlementSegmentSnapshots = snapshotRows.flatMap((snapshot) => rows(snapshot.segments).map((row) => ({
    id: text(row.id),
    settlement_batch_id: nullableUuid(row.settlement_batch_id ?? row.settlementBatchId ?? (snapshot.batch as Record<string, unknown> | undefined)?.id),
    segment_start: date(row.segment_start ?? row.segmentStart),
    segment_end: date(row.segment_end ?? row.segmentEnd),
    total_income: numberValue(row.total_income ?? row.totalIncome),
    total_expense: numberValue(row.total_expense ?? row.totalExpense),
    net_profit: numberValue(row.net_profit ?? row.netProfit),
    shares_snapshot: row.shares_snapshot ?? row.sharesSnapshot ?? [],
    created_at: iso(row.created_at ?? row.createdAt)
  })));
  const settlementTransferSnapshots = snapshotRows.flatMap((snapshot) => rows(snapshot.transfers).map((row) => ({
    id: text(row.id),
    settlement_batch_id: nullableUuid(row.settlement_batch_id ?? row.settlementBatchId ?? (snapshot.batch as Record<string, unknown> | undefined)?.id),
    from_partner_id: nullableUuid(row.from_partner_id ?? row.fromPartnerId),
    to_partner_id: nullableUuid(row.to_partner_id ?? row.toPartnerId),
    from_name_snapshot: text(row.from_name_snapshot ?? row.fromNameSnapshot),
    to_name_snapshot: text(row.to_name_snapshot ?? row.toNameSnapshot),
    amount: numberValue(row.amount),
    currency: text(row.currency, "EUR"),
    created_at: iso(row.created_at ?? row.createdAt)
  })));
  return projectRestoreData({ properties, rooms, tenants, contracts, rentPayments, expenses, deposits, viewingAppointments, tasks, partners, partnerShares, partnerNameHistory, settlementBatches, settlementPartnerSnapshots, settlementSegmentSnapshots, settlementTransferSnapshots });
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as { action?: string; payload?: unknown; beforeRestoreBackupPath?: string };
    if (body.action === "prepare_before_restore") {
      const workspaceId = context.profile.workspace_owner_id;
      const diagnosticContext = { workspaceId, ownerId: context.userId, bucket: BACKUP_BUCKET, mimeType: "application/json" };
      let stage = "database_read";
      let backupPath = "";
      try {
        stage = "database_read";
        const admin = getSupabaseAdmin();
        const currentData = await loadServerBackupData(admin, workspaceId);
        stage = "json_generation";
        const beforeRestore = await createDataExportPayload(currentData, new Date().toISOString(), { backupType: "cloud", exportedBy: context.userId, exportReason: "BeforeRestore", timezone: "UTC" });
        const now = new Date();
        const part = (value: number) => String(value).padStart(2, "0");
        const stamp = `${now.getUTCFullYear()}-${part(now.getUTCMonth() + 1)}-${part(now.getUTCDate())}-${part(now.getUTCHours())}-${part(now.getUTCMinutes())}-${part(now.getUTCSeconds())}-${String(now.getUTCMilliseconds()).padStart(3, "0")}`;
        const fileName = `BeforeRestore-${stamp}-${beforeRestore.metadata.backupId}.json`;
        backupPath = `${workspaceId}/before-restore/${fileName}`;
        stage = "json_serialization";
        const serialized = JSON.stringify(beforeRestore, null, 2);
        if (!serialized) throw new Error("JSON 序列化返回空结果");
        stage = "storage_upload";
        const upload = await admin.storage.from(BACKUP_BUCKET).upload(backupPath, Buffer.from(serialized, "utf8"), { contentType: "application/json", upsert: false });
        if (upload.error) {
          const diagnostic = beforeRestoreFailure(upload.error, stage, { ...diagnosticContext, objectPath: backupPath, storageResponse: upload.error, supabaseResponse: upload.error });
          logBeforeRestoreFailure(diagnostic);
          return NextResponse.json(diagnostic, { status: 503 });
        }
        stage = "response";
        return NextResponse.json({ ok: true, beforeRestore: { fileName, storagePath: backupPath, payload: beforeRestore } });
      } catch (error) {
        const diagnostic = beforeRestoreFailure(error, stage, { ...diagnosticContext, objectPath: backupPath || undefined });
        logBeforeRestoreFailure(diagnostic);
        return NextResponse.json(diagnostic, { status: 500 });
      }
    }
    if (!isDataExportPayload(body.payload)) return NextResponse.json({ error: "备份文件格式不正确，无法恢复。", code: "invalid_backup" }, { status: 400 });
    const integrity = await dryRunRestore(body.payload);
    if (!integrity.valid) return NextResponse.json({ error: integrity.errors[0] || "备份文件校验失败。", code: "invalid_backup" }, { status: 400 });
    const admin = getSupabaseAdmin();
    const backupPath = body.beforeRestoreBackupPath || "";
    const expectedPrefix = `${context.profile.workspace_owner_id}/before-restore/`;
    if (!backupPath.startsWith(expectedPrefix) || !backupPath.endsWith(".json")) return NextResponse.json({ error: "请先完成恢复前备份。", code: "before_restore_required" }, { status: 409 });
    const beforeRestoreFile = await admin.storage.from(BACKUP_BUCKET).download(backupPath);
    if (beforeRestoreFile.error || !beforeRestoreFile.data) return NextResponse.json({ error: "恢复前备份不可用，请重新生成。", code: "before_restore_missing" }, { status: 409 });
    const normalized = normalizeRestoreData(body.payload, context.profile.workspace_owner_id);
    const { data: dryRun, error } = await admin.rpc("restore_workspace_backup_dry_run", { p_workspace_owner_id: context.profile.workspace_owner_id, p_actor_account_id: context.userId, p_data: normalized });
    if (error || !dryRun?.ok) {
      const diagnostic = restoreDiagnostic(error, (dryRun || null) as Record<string, unknown> | null);
      console.error("Restore Dry Run RPC failed", {
        rpcName: "restore_workspace_backup_dry_run",
        workspaceOwnerId: context.profile.workspace_owner_id,
        ...diagnostic,
        rawRpcError: error ? { name: error.name, message: error.message, details: error.details, hint: error.hint, code: error.code, stack: error.stack } : null,
        rawDryRun: dryRun || null
      });
      return NextResponse.json({ ...diagnostic, rawRpcError: error ? { name: error.name, message: error.message, details: error.details, hint: error.hint, code: error.code, stack: error.stack } : null, rawDryRun: dryRun || null, report: { beforeRestore: { success: true }, upload: { success: true }, delete: { success: false }, import: { success: false }, fieldValidation: { success: false }, consistencyValidation: { success: false }, transactionRolledBack: true, databaseUnchanged: true } }, { status: 409 });
    }
    return NextResponse.json({ ok: true, dryRun: true, beforeRestoreBackupPath: backupPath, report: { beforeRestore: { success: true }, upload: { success: true }, delete: dryRun.delete || { success: true }, import: dryRun.import || { success: true }, fieldValidation: dryRun.fieldValidation || { success: true }, consistencyValidation: dryRun.consistencyValidation || { success: true }, transactionRolledBack: true, databaseUnchanged: true } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
