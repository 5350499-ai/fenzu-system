import { NextResponse } from "next/server";
import {
  AccountApiError,
  apiErrorResponse,
  parseJson,
  requireActiveAccount,
  requireModulePermission
} from "@/lib/server/account-auth";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tenants", "archive");
    const body = await parseJson(request) as { tenantId?: string; depositStatus?: string; actualMoveOutDate?: string | null };
    const depositStatus = String(body.depositStatus || "").trim();
    const actualMoveOutDate = body.actualMoveOutDate ? String(body.actualMoveOutDate) : null;
    if (!body.tenantId || !uuidPattern.test(body.tenantId)
      || !["待退", "已退", "已退回", "pending", "refunded"].includes(depositStatus)
      || (actualMoveOutDate !== null && !datePattern.test(actualMoveOutDate))) {
      throw new AccountApiError("退租请求资料不完整。", 400, "invalid_move_out");
    }

    const client = getSupabaseAuthVerifier(context.accessToken);
    const { data, error } = await client.rpc("move_out_tenant_atomic", {
      p_tenant_id: body.tenantId,
      p_deposit_status: depositStatus,
      p_actual_move_out_date: actualMoveOutDate
    });
    if (error) {
      if (error.code === "42501") throw new AccountApiError("没有权限办理退租。", 403, "move_out_permission_denied");
      if (error.code === "P0002") throw new AccountApiError("租客或房间不存在，可能已被其他操作移除。", 404, "move_out_not_found");
      if (error.code === "22023") throw new AccountApiError("退租请求资料无效。", 400, "invalid_move_out");
      throw new AccountApiError("退租未完成，数据库事务已回滚，请刷新后重试。", 409, "move_out_transaction_failed");
    }
    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
