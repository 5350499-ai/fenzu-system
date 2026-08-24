import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type LinkRow = { rent_payment_id: string | null; deposit_id: string | null };
type ReceiptIdentity = { id: string; user_id: string; property_id: string; room_id: string | null; tenant_id: string | null };

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "rent_payments", "view");
    await requireModulePermission(context, "deposits", "view");

    const admin = getSupabaseAdmin();
    const workspaceOwnerId = context.profile.workspace_owner_id;
    const [linkResult, paymentResult, depositResult, propertyAccessResult] = await Promise.all([
      admin.from("check_in_requests").select("rent_payment_id,deposit_id").eq("workspace_owner_id", workspaceOwnerId).not("completed_at", "is", null).not("rent_payment_id", "is", null).not("deposit_id", "is", null),
      admin.from("rent_payments").select("id,user_id,property_id,room_id,tenant_id").eq("user_id", workspaceOwnerId),
      admin.from("deposits").select("id,user_id,property_id,room_id,tenant_id").eq("user_id", workspaceOwnerId),
      context.profile.account_type === "owner" || context.profile.property_access_mode === "all"
        ? Promise.resolve({ data: null, error: null })
        : admin.from("user_property_access").select("property_id").eq("user_id", context.userId)
    ]);
    const firstError = linkResult.error || paymentResult.error || depositResult.error || propertyAccessResult.error;
    if (firstError) throw new AccountApiError("读取一键入住收款关系失败，请稍后重试。", 500, "check_in_receipt_links_read_failed");

    const allowedPropertyIds = propertyAccessResult.data
      ? new Set(propertyAccessResult.data.map((row) => String(row.property_id)))
      : null;
    const payments = new Map(((paymentResult.data || []) as ReceiptIdentity[]).map((row) => [row.id, row]));
    const deposits = new Map(((depositResult.data || []) as ReceiptIdentity[]).map((row) => [row.id, row]));
    const seenPayments = new Set<string>();
    const seenDeposits = new Set<string>();
    const links: Array<{ paymentId: string; depositId: string }> = [];

    for (const row of (linkResult.data || []) as LinkRow[]) {
      const paymentId = String(row.rent_payment_id || "");
      const depositId = String(row.deposit_id || "");
      const payment = payments.get(paymentId);
      const deposit = deposits.get(depositId);
      if (!payment || !deposit) throw new AccountApiError("一键入住收款关系不完整，已停止财务投影。", 409, "check_in_receipt_link_incomplete");
      const sameIdentity = payment.user_id === workspaceOwnerId
        && deposit.user_id === workspaceOwnerId
        && payment.property_id === deposit.property_id
        && payment.room_id === deposit.room_id
        && payment.tenant_id === deposit.tenant_id;
      if (!sameIdentity) throw new AccountApiError("一键入住收款关系不一致，已停止财务投影。", 409, "check_in_receipt_link_mismatch");
      if (seenPayments.has(paymentId) || seenDeposits.has(depositId)) {
        throw new AccountApiError("一键入住收款关系不唯一，已停止财务投影。", 409, "check_in_receipt_link_ambiguous");
      }
      seenPayments.add(paymentId);
      seenDeposits.add(depositId);
      if (!allowedPropertyIds || allowedPropertyIds.has(payment.property_id)) links.push({ paymentId, depositId });
    }

    return NextResponse.json({ links }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
