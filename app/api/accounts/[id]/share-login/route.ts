import { NextResponse } from "next/server";
import {
  AccountApiError,
  apiErrorResponse,
  parseJson,
  requireActiveAccount,
  writeAuditLog
} from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireActiveAccount(request, true);
    const { id } = await params;
    const body = await parseJson(request) as { action?: unknown };
    const action = body.action === "shared" ? "shared" : body.action === "copied" ? "copied" : null;

    if (!action) {
      throw new AccountApiError("分享操作无效。", 400);
    }

    const admin = getSupabaseAdmin();
    const { data: target, error } = await admin
      .from("user_profiles")
      .select("auth_user_id,username,display_name,account_type,status")
      .eq("auth_user_id", id)
      .maybeSingle();

    if (error || !target || target.account_type !== "custom") {
      throw new AccountApiError("只能分享自定义账号的登录信息。", 400);
    }

    await writeAuditLog(context, {
      actionType: action === "shared" ? "login_info_shared" : "login_info_copied",
      moduleKey: "accounts",
      entityType: "user_profile",
      entityId: target.auth_user_id,
      description: `主管理员${action === "shared" ? "分享" : "复制"}了账号“${target.display_name}”的登录信息`
    });

    return NextResponse.json({
      ok: true,
      account: {
        displayName: target.display_name,
        username: target.username,
        status: target.status
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
