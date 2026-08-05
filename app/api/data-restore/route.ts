import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createDataExportPayload,
  dryRunRestore,
  isDataExportPayload,
  type DataExportPayload
} from "@/lib/data-export";

const BACKUP_BUCKET = "system-backups";

function rows(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function nullableText(value: unknown) { const result = text(value); return result || null; }
function date(value: unknown) { return nullableText(value); }
function monthDate(value: unknown) {
  const raw = nullableText(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw;
}
function numberValue(value: unknown, fallback = 0) { return typeof value === "number" && Number.isFinite(value) ? value : Number(value || fallback); }
function booleanValue(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function iso(value: unknown) { return text(value) || new Date().toISOString(); }

function normalizeRestoreData(payload: DataExportPayload, workspaceOwnerId: string) {
  const source = payload.data;
  const properties = rows(source.properties).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, name: text(row.name), address: text(row.address), city: text(row.city),
    landlord_name: text(row.landlordName), property_type: null, sublet_allowed: booleanValue(row.subletAllowed), notes: nullableText(row.notes),
    occupancy_tracking_start_date: date(row.occupancyTrackingStartDate), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const rooms = rows(source.rooms).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: text(row.propertyId), name: text(row.name), room_number: text(row.roomNumber),
    monthly_rent: numberValue(row.monthlyRent), deposit_amount: numberValue(row.depositAmount), status: text(row.status, "vacant"),
    area: null, has_window: false, has_private_bathroom: false, furniture: null, notes: nullableText(row.notes), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const tenants = rows(source.tenants).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: text(row.propertyId), room_id: text(row.roomId), name: text(row.name),
    phone: nullableText(row.phone), email: null, wechat: nullableText(row.wechat), whatsapp: null, passport_number: null, nie_number: null,
    nationality: null, source: nullableText(row.source), move_in_date: date(row.moveInDate), expected_move_out_date: null,
    actual_move_out_date: date(row.actualMoveOutDate), monthly_rent: numberValue(row.monthlyRent), deposit_amount: numberValue(row.depositAmount),
    key_count: 0, payment_day: row.paymentDay == null ? 20 : numberValue(row.paymentDay, 20), status: text(row.status, "active"), notes: nullableText(row.notes),
    created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const contracts = rows(source.contracts).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, contract_type: "tenant_contract", property_id: text(row.propertyId), room_id: nullableText(row.roomId),
    tenant_id: nullableText(row.tenantId), landlord_id: null, monthly_rent: numberValue(row.monthlyRent), deposit_amount: numberValue(row.depositAmount),
    start_date: date(row.startDate), end_date: date(row.endDate), is_signed: false, is_active: text(row.status) !== "ended", status: text(row.status, "active"),
    file_url: null, storage_path: null, notes: nullableText(row.notes), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const rentPayments = rows(source.rentPayments).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, tenant_id: text(row.tenantId), property_id: text(row.propertyId), room_id: text(row.roomId),
    rent_month: monthDate(row.rentMonth) || "1970-01-01", amount_due: numberValue(row.amountDue), amount_paid: numberValue(row.amountPaid), amount_unpaid: numberValue(row.amountUnpaid),
    payment_date: date(row.paymentDate), payment_method: nullableText(row.paymentMethod), is_overdue: booleanValue(row.isOverdue), notes: nullableText(row.notes),
    created_at: iso(row.createdAt), updated_at: iso(row.updatedAt), received_by: nullableText(row.receivedBy) || "A", paid_by: null,
    payment_status: nullableText(row.paymentStatus) || (numberValue(row.amountPaid) > 0 ? "已收" : "未收"), income_type: nullableText(row.incomeType) || "房租收入",
    income_item: nullableText(row.incomeItem), coverage_start_date: date(row.coverageStartDate), coverage_end_date: date(row.coverageEndDate)
  }));
  const expenses = rows(source.expenses).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: text(row.propertyId), room_id: nullableText(row.roomId), expense_month: monthDate(row.expenseMonth) || "1970-01-01",
    category: text(row.category, "其他"), amount: numberValue(row.amount), payment_date: date(row.paymentDate), payment_method: nullableText(row.paymentMethod),
    paid_by: nullableText(row.paidBy) || "A", is_paid: booleanValue(row.isPaid), notes: nullableText(row.notes), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const deposits = rows(source.deposits).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, tenant_id: text(row.tenantId), property_id: text(row.propertyId), room_id: text(row.roomId),
    transaction_type: text(row.type, "收取"), amount: numberValue(row.amount), transaction_date: date(row.transactionDate), status: text(row.status, "已收"),
    notes: nullableText(row.notes), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt), received_by: nullableText(row.receivedBy) || "A", paid_by: nullableText(row.paidBy) || "A"
  }));
  const viewingAppointments = rows(source.viewingAppointments).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, property_id: nullableText(row.propertyId), room_id: nullableText(row.roomId), appointment_date: text(row.appointmentDate),
    appointment_time: text(row.appointmentTime), contact_name: nullableText(row.contactName), contact_whatsapp: nullableText(row.contactWhatsapp), contact_phone: nullableText(row.contactPhone),
    status: text(row.status, "待看房"), notes: nullableText(row.notes), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const tasks = rows(source.tasks).map((row) => ({
    id: text(row.id), user_id: workspaceOwnerId, task_type: text(row.taskType, "manual"), title: text(row.title), description: nullableText(row.description), due_date: date(row.dueDate),
    status: text(row.status, "待处理"), priority: text(row.priority, "普通"), property_id: nullableText(row.propertyId), room_id: nullableText(row.roomId), tenant_id: nullableText(row.tenantId),
    contract_id: nullableText(row.contractId), rent_payment_id: nullableText(row.rentPaymentId), deposit_id: nullableText(row.depositId), completed_at: null, notes: nullableText(row.notes), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const partners = rows(source.partners).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, legacy_code: nullableText(row.legacyCode), display_name: text(row.displayName), color_key: nullableText(row.colorKey),
    sort_order: numberValue(row.sortOrder), is_active: booleanValue(row.isActive, true), linked_account_id: nullableText(row.linkedAccountId), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const partnerShares = rows(source.partnerShares).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, property_id: text(row.propertyId), partner_id: text(row.partnerId), percentage: numberValue(row.percentage),
    effective_from: text(row.effectiveFrom), effective_to: date(row.effectiveTo), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt)
  }));
  const partnerNameHistory = rows(source.partnerNameHistory).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, partner_id: text(row.partnerId), old_display_name: text(row.oldDisplayName), new_display_name: text(row.newDisplayName),
    changed_at: iso(row.changedAt), changed_by_account_id: nullableText(row.changedByAccountId), created_at: iso(row.createdAt)
  }));
  const settlementBatches = rows(source.settlementBatches).map((row) => ({
    id: text(row.id), workspace_owner_id: workspaceOwnerId, property_id: text(row.property_id || row.propertyId), period_start: text(row.period_start || row.periodStart), period_end: text(row.period_end || row.periodEnd),
    status: text(row.status, "confirmed"), total_income: numberValue(row.total_income ?? row.totalIncome), total_expense: numberValue(row.total_expense ?? row.totalExpense), net_profit: numberValue(row.net_profit ?? row.netProfit),
    currency: text(row.currency, "EUR"), confirmed_at: iso(row.confirmed_at || row.confirmedAt), confirmed_by_account_id: nullableText(row.confirmed_by_account_id || row.confirmedByAccountId),
    reversed_at: date(row.reversed_at || row.reversedAt), reversed_by_account_id: nullableText(row.reversed_by_account_id || row.reversedByAccountId), reversal_reason: nullableText(row.reversal_reason || row.reversalReason), note: nullableText(row.note),
    created_at: iso(row.created_at || row.createdAt), updated_at: iso(row.updated_at || row.updatedAt), property_name_snapshot: nullableText(row.property_name_snapshot || row.propertyNameSnapshot), confirmed_by_display_name_snapshot: nullableText(row.confirmed_by_display_name_snapshot || row.confirmedByDisplayNameSnapshot), income_details_snapshot: row.income_details_snapshot || row.incomeDetailsSnapshot || [], expense_details_snapshot: row.expense_details_snapshot || row.expenseDetailsSnapshot || []
  }));
  const snapshotRows = rows(source.settlementSnapshots);
  const settlementPartnerSnapshots = snapshotRows.flatMap((snapshot) => rows(snapshot.partners).map((row) => ({ ...row, settlement_batch_id: text((snapshot.batch as Record<string, unknown> | undefined)?.id) })));
  const settlementSegmentSnapshots = snapshotRows.flatMap((snapshot) => rows(snapshot.segments).map((row) => ({ ...row, settlement_batch_id: text((snapshot.batch as Record<string, unknown> | undefined)?.id) })));
  const settlementTransferSnapshots = snapshotRows.flatMap((snapshot) => rows(snapshot.transfers).map((row) => ({ ...row, settlement_batch_id: text((snapshot.batch as Record<string, unknown> | undefined)?.id) })));
  return { properties, rooms, tenants, contracts, rentPayments, expenses, deposits, viewingAppointments, tasks, partners, partnerShares, partnerNameHistory, settlementBatches, settlementPartnerSnapshots, settlementSegmentSnapshots, settlementTransferSnapshots };
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as { payload?: unknown; currentData?: Record<string, unknown> };
    if (!isDataExportPayload(body.payload)) return NextResponse.json({ error: "备份文件格式不正确，无法恢复。", code: "invalid_backup" }, { status: 400 });
    const integrity = await dryRunRestore(body.payload);
    if (!integrity.valid) return NextResponse.json({ error: integrity.errors[0] || "备份文件校验失败。", code: "invalid_backup" }, { status: 400 });
    if (!body.currentData || typeof body.currentData !== "object") return NextResponse.json({ error: "恢复前无法创建当前数据备份。", code: "autobackup_failed" }, { status: 409 });
    const admin = getSupabaseAdmin();
    const beforeRestore = await createDataExportPayload(body.currentData, new Date().toISOString(), { backupType: "cloud", exportedBy: context.userId, exportReason: "BeforeRestore", timezone: "UTC" });
    const backupPath = `${context.profile.workspace_owner_id}/before-restore-${beforeRestore.metadata.backupId}.json`;
    const upload = await admin.storage.from(BACKUP_BUCKET).upload(backupPath, Buffer.from(JSON.stringify(beforeRestore, null, 2), "utf8"), { contentType: "application/json;charset=utf-8", upsert: false });
    if (upload.error) return NextResponse.json({ error: "恢复前自动备份失败，未修改任何数据。", code: "autobackup_failed" }, { status: 503 });
    const normalized = normalizeRestoreData(body.payload, context.profile.workspace_owner_id);
    const { error } = await admin.rpc("restore_workspace_backup", { p_workspace_owner_id: context.profile.workspace_owner_id, p_actor_account_id: context.userId, p_data: normalized });
    if (error) return NextResponse.json({ error: "恢复失败，已回滚全部数据库变更。恢复前备份仍然保留。", code: "restore_transaction_failed" }, { status: 409 });
    return NextResponse.json({ ok: true, beforeRestoreBackupPath: backupPath });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
