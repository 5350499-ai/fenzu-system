import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { AccountApiError, apiErrorResponse, revokeAllAppSessions } from "@/lib/server/account-auth";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) throw new AccountApiError("登录已失效，请重新登录。", 401, "unauthorized");
    const verifier = getSupabaseAuthVerifier(token);
    const { data, error } = await verifier.auth.getUser(token);
    if (error || !data.user) throw new AccountApiError("登录已失效，请重新登录。", 401, "unauthorized");
    const admin = getSupabaseAdmin();
    const { data: profile } = await admin.from("user_profiles").select("auth_user_id,status").eq("auth_user_id", data.user.id).maybeSingle();
    if (!profile || profile.status !== "active") throw new AccountApiError("当前账号不可用。", 403, "forbidden");
    await revokeAllAppSessions(data.user.id, data.user.id, "password_recovery_completed");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
