import { NextResponse } from "next/server";
import {
  AccountApiError,
  apiErrorResponse,
  parseJson,
  requireActiveAccount,
  requireModulePermission,
  requirePropertyAccess
} from "@/lib/server/account-auth";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

type MoveTenantBody = {
  tenantId?: string;
  propertyId?: string;
  roomId?: string;
  name?: string;
  phone?: string;
  wechat?: string;
  source?: string;
  monthlyRent?: number;
  depositAmount?: number;
  paymentDay?: number | null;
  status?: string;
  notes?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as MoveTenantBody;
    const monthlyRent = Number(body.monthlyRent ?? 0);
    const depositAmount = Number(body.depositAmount ?? 0);
    const paymentDay = body.paymentDay == null ? null : Number(body.paymentDay);

    if (!body.tenantId || !uuidPattern.test(body.tenantId)
      || !body.propertyId || !uuidPattern.test(body.propertyId)
      || !body.roomId || !uuidPattern.test(body.roomId)
      || !body.name?.trim()
      || !Number.isFinite(monthlyRent) || monthlyRent < 0
      || !Number.isFinite(depositAmount) || depositAmount < 0
      || (paymentDay != null && (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31))) {
      throw new AccountApiError("请检查租客资料。", 400);
    }

    await requireModulePermission(context, "tenants", "edit");
    await requireModulePermission(context, "rooms", "edit");
    await requirePropertyAccess(context, body.propertyId);

    const client = getSupabaseAuthVerifier(context.accessToken);
    const { data, error } = await client.rpc("update_tenant_current_assignment", {
      p_tenant_id: body.tenantId,
      p_property_id: body.propertyId,
      p_room_id: body.roomId,
      p_name: body.name.trim(),
      p_phone: body.phone?.trim() || null,
      p_wechat: body.wechat?.trim() || null,
      p_source: body.source?.trim() || "其他",
      p_monthly_rent: monthlyRent,
      p_deposit_amount: depositAmount,
      p_payment_day: paymentDay,
      p_status: body.status?.trim() || "在租",
      p_notes: body.notes?.trim() || null
    });

    if (error) {
      if (error.code === "42501") throw new AccountApiError("没有权限调整租客当前房间。", 403);
      if (error.code === "22023") throw new AccountApiError("请检查租客资料。", 400);
      if (error.code === "P0002") throw new AccountApiError("租客或房间不存在，请刷新后重试。", 404);
      throw new AccountApiError("保存租客失败，请稍后重试。", 500);
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
