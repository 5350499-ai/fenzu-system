import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requirePropertyAccess, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rentCollectionRemaining } from "@/lib/rent-collection";
import { isWaivableRentCollectionEvent } from "@/lib/rent-coverage";
import type { BusinessRentPayment } from "@/lib/business-data";
import { getDebtCases } from "@/lib/debt-case";
import { rentPeriodToday } from "@/lib/rent-period-state";

const WAIVE_ACTION = "waive_rent_collection";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "rent_payments", "view");
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("audit_logs")
      .select("entity_id,after_data,created_at,actor_user_id")
      .eq("module_key", "rent_payments")
      .eq("action_type", WAIVE_ACTION)
      .eq("success", true)
      .order("created_at", { ascending: false });
    if (error) throw new AccountApiError("读取欠租处理记录失败，请稍后重试。", 500);
    const workspaceOwnerId = context.profile.workspace_owner_id;
    const actions = (data || []).filter((row) => {
      const after = row.after_data as Record<string, unknown> | null;
      return after?.workspace_owner_id === workspaceOwnerId;
    }).map((row) => ({
      rentPaymentId: row.entity_id,
      status: "waived" as const,
      reason: String((row.after_data as Record<string, unknown> | null)?.reason || ""),
      createdAt: row.created_at,
      createdBy: row.actor_user_id
    }));
    return NextResponse.json({ actions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "rent_payments", "edit");
    const body = await parseJson(request) as { action?: string; rentPaymentId?: string; reason?: string };
    if (body.action !== "waive" || !body.rentPaymentId) throw new AccountApiError("欠租处理请求不完整。", 400);
    const admin = getSupabaseAdmin();
    const derivedTarget = parseDerivedDebtId(body.rentPaymentId);
    let propertyId = "";
    let roomId = "";
    let tenantId = "";
    let remaining = 0;
    if (derivedTarget) {
      const { data: tenantRow, error: tenantError } = await admin.from("tenants")
        .select("id,property_id,room_id,name,phone,wechat,source,monthly_rent,deposit_amount,occupant_count,payment_day,move_in_date,actual_move_out_date,status,notes")
        .eq("id", derivedTarget.tenantId)
        .maybeSingle();
      if (tenantError || !tenantRow) throw new AccountApiError("对应租客不存在或无权访问。", 404);
      await assertWorkspaceProperty(admin, tenantRow.property_id, context.profile.workspace_owner_id);
      const { data: paymentRows, error: paymentError } = await admin.from("rent_payments")
        .select("id,property_id,room_id,tenant_id,amount_due,amount_paid,amount_unpaid,payment_date,coverage_start_date,coverage_end_date,rent_month,income_type,payment_status,payment_method,notes,created_at")
        .eq("tenant_id", derivedTarget.tenantId)
        .eq("property_id", tenantRow.property_id);
      if (paymentError) throw new AccountApiError("读取欠租周期失败，请稍后重试。", 500);
      propertyId = tenantRow.property_id;
      roomId = tenantRow.room_id;
      tenantId = tenantRow.id;
      await requirePropertyAccess(context, propertyId);
      const tenant = {
        id: tenantRow.id, propertyId, roomId, name: tenantRow.name || "", phone: tenantRow.phone || "", wechat: tenantRow.wechat || "",
        source: tenantRow.source || "", monthlyRent: Number(tenantRow.monthly_rent || 0), depositAmount: Number(tenantRow.deposit_amount || 0),
        occupantCount: Number(tenantRow.occupant_count || 1), paymentDay: tenantRow.payment_day || undefined,
        moveInDate: tenantRow.move_in_date || undefined, actualMoveOutDate: tenantRow.actual_move_out_date || undefined,
        status: tenantRow.status || "", notes: tenantRow.notes || ""
      };
      const payments = (paymentRows || []).map((row) => ({
        id: row.id, propertyId: row.property_id, roomId: row.room_id, tenantId: row.tenant_id, rentMonth: row.rent_month || "",
        paymentDate: row.payment_date || undefined, amountDue: Number(row.amount_due || 0), amountPaid: Number(row.amount_paid || 0), amountUnpaid: Number(row.amount_unpaid || 0),
        coverageStartDate: row.coverage_start_date || "", coverageEndDate: row.coverage_end_date || "", incomeType: row.income_type || "房租收入",
        paymentStatus: row.payment_status || "", paymentMethod: row.payment_method || "", notes: row.notes || "", createdAt: row.created_at || undefined, isOverdue: false
      })) as BusinessRentPayment[];
      const debtCase = getDebtCases({
        properties: [{ id: propertyId, name: "房源", address: "", city: "" }],
        rooms: [{ id: roomId, propertyId, name: "房间", roomNumber: "", monthlyRent: tenant.monthlyRent, depositAmount: tenant.depositAmount, status: "" }],
        tenants: [tenant], rentPayments: payments, today: rentPeriodToday()
      }).find((item) => item.paymentId === body.rentPaymentId);
      if (!debtCase?.isDerived || debtCase.coverageStart !== derivedTarget.periodStart) throw new AccountApiError("这笔欠租周期当前没有可放弃的欠租提醒。", 409);
      remaining = debtCase.remainingAmount;
    } else {
      const { data: payment, error: paymentError } = await admin.from("rent_payments")
        .select("id,property_id,room_id,tenant_id,amount_due,amount_paid,amount_unpaid,payment_date,coverage_start_date,coverage_end_date,income_type,payment_status,notes")
        .eq("id", body.rentPaymentId)
        .maybeSingle();
      if (paymentError || !payment) throw new AccountApiError("对应租金周期不存在或无权访问。", 404);
      await assertWorkspaceProperty(admin, payment.property_id, context.profile.workspace_owner_id);
      const { data: tenantRow, error: tenantError } = await admin.from("tenants")
        .select("id,property_id")
        .eq("id", payment.tenant_id)
        .maybeSingle();
      if (tenantError || !tenantRow || tenantRow.property_id !== payment.property_id) throw new AccountApiError("对应租客不存在或无权访问。", 404);
      propertyId = payment.property_id;
      roomId = payment.room_id;
      tenantId = payment.tenant_id;
      await requirePropertyAccess(context, propertyId);
      const businessPayment = {
        amountDue: Number(payment.amount_due || 0), amountPaid: Number(payment.amount_paid || 0), amountUnpaid: Number(payment.amount_unpaid || 0),
        coverageStartDate: payment.coverage_start_date || "", coverageEndDate: payment.coverage_end_date || "", incomeType: payment.income_type || "",
        paymentStatus: payment.payment_status || "", notes: payment.notes || ""
      } as BusinessRentPayment;
      if (!isWaivableRentCollectionEvent(businessPayment)) throw new AccountApiError("\u8fd9\u7b14\u79df\u91d1\u5468\u671f\u5f53\u524d\u6ca1\u6709\u53ef\u653e\u5f03\u7684\u6b20\u79df\u63d0\u9192\u3002", 409);
      remaining = rentCollectionRemaining(businessPayment);
    }
    const { data: existing, error: existingError } = await admin.from("audit_logs")
      .select("id")
      .eq("module_key", "rent_payments")
      .eq("action_type", WAIVE_ACTION)
      .eq("entity_id", body.rentPaymentId)
      .eq("success", true)
      .contains("after_data", { workspace_owner_id: context.profile.workspace_owner_id })
      .limit(1);
    if (existingError) throw new AccountApiError("检查欠租处理状态失败，请稍后重试。", 500);
    if (existing?.length) throw new AccountApiError("这笔欠租已经关闭追缴。", 409);
    const reason = String(body.reason || "").trim().slice(0, 500);
    await writeAuditLog(context, {
      actionType: WAIVE_ACTION,
      moduleKey: "rent_payments",
      entityType: "rent_collection",
      entityId: body.rentPaymentId,
      beforeData: { status: "open", rent_payment_id: body.rentPaymentId, remaining_amount: remaining },
      afterData: {
        status: "waived",
        rent_payment_id: body.rentPaymentId,
        workspace_owner_id: context.profile.workspace_owner_id,
        property_id: propertyId,
        room_id: roomId,
        tenant_id: tenantId,
        remaining_amount: remaining,
        reason
      },
      description: `放弃追缴欠租 ${body.rentPaymentId}，金额数值 ${remaining.toFixed(2)}（显示货币由工作区设置决定）${reason ? `，原因：${reason}` : ""}`,
      logCategory: "business"
    });
    return NextResponse.json({ ok: true, rentPaymentId: body.rentPaymentId, status: "waived" });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function parseDerivedDebtId(value: string) {
  const match = /^derived_rent_debt:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(value);
  return match ? { tenantId: match[1], periodStart: match[2] } : null;
}

async function assertWorkspaceProperty(admin: ReturnType<typeof getSupabaseAdmin>, propertyId: string | null, workspaceOwnerId: string) {
  if (!propertyId) throw new AccountApiError("对应房源不存在或无权访问。", 404);
  const { data: property, error } = await admin.from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", workspaceOwnerId)
    .maybeSingle();
  if (error || !property) throw new AccountApiError("对应租客不存在或无权访问。", 404);
}
