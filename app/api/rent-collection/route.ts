import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requirePropertyAccess, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { rentCollectionRemaining } from "@/lib/rent-collection";
import { isWaivableRentCollectionEvent } from "@/lib/rent-coverage";
import type { BusinessRentPayment } from "@/lib/business-data";

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
    const client = getSupabaseAuthVerifier(context.accessToken);
    const { data: payment, error: paymentError } = await client.from("rent_payments")
      .select("id,property_id,room_id,tenant_id,amount_due,amount_paid,amount_unpaid,payment_date,coverage_start_date,coverage_end_date,income_type,payment_status,notes")
      .eq("id", body.rentPaymentId)
      .maybeSingle();
    if (paymentError || !payment) throw new AccountApiError("对应租金周期不存在或无权访问。", 404);
    await requirePropertyAccess(context, payment.property_id);
    const businessPayment = {
      amountDue: Number(payment.amount_due || 0),
      amountPaid: Number(payment.amount_paid || 0),
      amountUnpaid: Number(payment.amount_unpaid || 0),
      coverageStartDate: payment.coverage_start_date || "",
      coverageEndDate: payment.coverage_end_date || "",
      incomeType: payment.income_type || "",
      paymentStatus: payment.payment_status || "",
      notes: payment.notes || ""
    } as BusinessRentPayment;
    if (!isWaivableRentCollectionEvent(businessPayment)) throw new AccountApiError("\u8fd9\u7b14\u79df\u91d1\u5468\u671f\u5f53\u524d\u6ca1\u6709\u53ef\u653e\u5f03\u7684\u6b20\u79df\u63d0\u9192\u3002", 409);
    const remaining = rentCollectionRemaining(businessPayment);
    const admin = getSupabaseAdmin();
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
        property_id: payment.property_id,
        room_id: payment.room_id,
        tenant_id: payment.tenant_id,
        remaining_amount: remaining,
        reason
      },
      description: `放弃追缴欠租 ${body.rentPaymentId}，金额 €${remaining.toFixed(2)}${reason ? `，原因：${reason}` : ""}`,
      logCategory: "business"
    });
    return NextResponse.json({ ok: true, rentPaymentId: body.rentPaymentId, status: "waived" });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
