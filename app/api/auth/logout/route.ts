import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    if (context.sessionId) {
      const admin = getSupabaseAdmin();
      await admin
        .from("app_sessions")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: context.userId, revoke_reason: "user_logout" })
        .eq("session_id", context.sessionId)
        .eq("status", "active");
    }
    await writeAuditLog(context, { actionType: "logout", moduleKey: "auth", description: "账号退出登录" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
