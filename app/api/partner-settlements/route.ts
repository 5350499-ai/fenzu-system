import { NextResponse } from "next/server";
import { apiErrorResponse, AccountApiError, parseJson, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildSettlement } from "@/lib/partner-settlement";
import type { BusinessExpense, BusinessRentPayment } from "@/lib/business-data";
import type { Partner, PartnerPropertyShare } from "@/lib/partners";

function isVoidError(message: string) {
  if (message.includes("overlap") || message.includes("23P01")) return new AccountApiError("所选时间段与已结算记录重叠，请调整日期后重试。", 409, "settlement_overlap");
  if (message.includes("Property does not belong")) return new AccountApiError("房源不存在或无权访问。", 403, "permission_denied");
  return new AccountApiError("结算操作失败，请稍后重试。", 500, "settlement_transaction_failed");
}

async function loadInputs(ownerId: string) {
  const admin = getSupabaseAdmin();
  const [propertiesResult, partnersResult, sharesResult, paymentsResult, expensesResult] = await Promise.all([
    admin.from("properties").select("id,name,address,city").eq("user_id", ownerId),
    admin.from("partners").select("id,workspace_owner_id,legacy_code,display_name,color_key,sort_order,is_active,linked_account_id").eq("workspace_owner_id", ownerId),
    admin.from("partner_property_shares").select("id,workspace_owner_id,property_id,partner_id,percentage,effective_from,effective_to").eq("workspace_owner_id", ownerId),
    admin.from("rent_payments").select("id,property_id,room_id,tenant_id,income_type,income_item,rent_month,payment_date,amount_due,amount_paid,amount_unpaid,coverage_start_date,coverage_end_date,payment_method,received_by,payment_status,is_overdue,notes").eq("user_id", ownerId),
    admin.from("expenses").select("id,property_id,room_id,expense_month,category,amount,payment_date,payment_method,paid_by,is_paid,notes").eq("user_id", ownerId)
  ]);
  const error = propertiesResult.error || partnersResult.error || sharesResult.error || paymentsResult.error || expensesResult.error;
  if (error) throw new Error(error.message);
  const partners = (partnersResult.data || []).map((row) => ({ id: row.id, workspaceOwnerId: row.workspace_owner_id, legacyCode: row.legacy_code, displayName: row.display_name, colorKey: row.color_key, sortOrder: row.sort_order, isActive: row.is_active, linkedAccountId: row.linked_account_id, propertyCount: 0, currentPropertyCount: 0, futurePropertyCount: 0 })) as Partner[];
  const shares = (sharesResult.data || []).map((row) => ({ id: row.id, workspaceOwnerId: row.workspace_owner_id, propertyId: row.property_id, partnerId: row.partner_id, percentage: Number(row.percentage), effectiveFrom: row.effective_from, effectiveTo: row.effective_to })) as PartnerPropertyShare[];
  const payments = (paymentsResult.data || []).map((row) => ({ id: row.id, propertyId: row.property_id || "", roomId: row.room_id || "", tenantId: row.tenant_id || "", incomeType: row.income_type, incomeItem: row.income_item || "", rentMonth: String(row.rent_month || "").slice(0, 7), paymentDate: row.payment_date || "", amountDue: Number(row.amount_due || 0), amountPaid: Number(row.amount_paid || 0), amountUnpaid: Number(row.amount_unpaid || 0), coverageStartDate: row.coverage_start_date || "", coverageEndDate: row.coverage_end_date || "", paymentMethod: row.payment_method || "", receivedBy: row.received_by || "", paymentStatus: row.payment_status || "", isOverdue: Boolean(row.is_overdue), notes: row.notes || "" })) as BusinessRentPayment[];
  const expenses = (expensesResult.data || []).map((row) => ({ id: row.id, propertyId: row.property_id || "", roomId: row.room_id || "", expenseMonth: String(row.expense_month || "").slice(0, 7), category: row.category || "", amount: Number(row.amount || 0), paymentDate: row.payment_date || "", paymentMethod: row.payment_method || "", paidBy: row.paid_by || "", isPaid: Boolean(row.is_paid), notes: row.notes || "" })) as BusinessExpense[];
  return { properties: propertiesResult.data || [], partners, shares, payments, expenses };
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_view_partnership_settlement");
    const admin = getSupabaseAdmin();
    const url = new URL(request.url);
    const batchId = url.searchParams.get("id");
    let query = admin.from("partner_settlement_batches").select("*").eq("workspace_owner_id", context.profile.workspace_owner_id).order("period_end", { ascending: false }).order("confirmed_at", { ascending: false });
    if (batchId) query = query.eq("id", batchId);
    const { data: batches, error } = await query;
    if (error) throw new Error(error.message);
    if (batchId && batches?.[0]) {
      const [partners, segments, transfers] = await Promise.all([
        admin.from("partner_settlement_partner_snapshots").select("*").eq("settlement_batch_id", batchId).order("partner_display_name_snapshot"),
        admin.from("partner_settlement_segment_snapshots").select("*").eq("settlement_batch_id", batchId).order("segment_start"),
        admin.from("partner_settlement_transfer_snapshots").select("*").eq("settlement_batch_id", batchId).order("created_at")
      ]);
      return NextResponse.json({ batch: batches[0], partners: partners.data || [], segments: segments.data || [], transfers: transfers.data || [] });
    }
    return NextResponse.json({ batches: batches || [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as Record<string, unknown>;
    const propertyId = String(body.propertyId || "");
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    if (!propertyId || propertyId === "all") throw new AccountApiError("确认结算时必须选择一套房源。", 400, "property_required");
    const inputs = await loadInputs(context.profile.workspace_owner_id);
    const settlement = buildSettlement(propertyId, { startDate, endDate }, inputs.properties, inputs.partners, inputs.shares, inputs.payments, inputs.expenses);
    if (settlement.invalidRange) throw new AccountApiError("结算日期范围无效。", 400, "invalid_range");
    if (settlement.unknownAttributions.length) throw new AccountApiError("存在无法识别归属的历史账目，暂不能确认结算。", 409, "unknown_attribution");
    const shareSegments = new Map<string, Array<{ startDate: string; endDate: string; percentage: number }>>();
    settlement.segments.forEach((segment) => segment.shares.forEach((share) => {
      const values = shareSegments.get(share.partnerId) || [];
      values.push({ startDate: segment.startDate, endDate: segment.endDate, percentage: share.percentage });
      shareSegments.set(share.partnerId, values);
    }));
    const partnerRows = settlement.partners.map((partner) => ({ partnerId: partner.partnerId, displayName: partner.displayName, legacyCode: partner.legacyCode, collected: partner.collected, advanced: partner.advanced, actualRetained: partner.actualRetained, profitEntitlement: partner.profitEntitlement, balance: partner.balance, shareSegments: shareSegments.get(partner.partnerId) || [] }));
    const transfers = settlement.transfers.map((transfer) => ({ ...transfer, fromName: settlement.partners.find((partner) => partner.partnerId === transfer.fromPartnerId)?.displayName || "", toName: settlement.partners.find((partner) => partner.partnerId === transfer.toPartnerId)?.displayName || "" }));
    const { data: batchId, error } = await getSupabaseAdmin().rpc("confirm_partner_settlement", {
      p_workspace_owner_id: context.profile.workspace_owner_id,
      p_property_id: propertyId,
      p_period_start: startDate,
      p_period_end: endDate,
      p_total_income: settlement.totalIncome,
      p_total_expense: settlement.totalExpense,
      p_net_profit: settlement.netProfit,
      p_confirmed_by_account_id: context.userId,
      p_partners: partnerRows,
      p_segments: settlement.segments,
      p_transfers: transfers,
      p_note: body.note ? String(body.note).trim().slice(0, 500) : null
    });
    if (error) throw isVoidError(error.message);
    return NextResponse.json({ ok: true, batchId });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
