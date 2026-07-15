import { NextResponse } from "next/server";
import { normalizeLoginIdentifier } from "@/lib/account-permissions";
import { AccountApiError, apiErrorResponse, type AccountRequestContext, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin, getSupabasePublicServerClient } from "@/lib/supabase-admin";

function readSessionId(accessToken: string) {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return null;
    const text = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return (JSON.parse(text) as { session_id?: string }).session_id || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { identifier?: unknown; password?: unknown } | null;
    const identifier = typeof body?.identifier === "string" ? normalizeLoginIdentifier(body.identifier) : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!identifier || !password) throw new AccountApiError("请输入登录账号和密码。", 400);

    const admin = getSupabaseAdmin();
    const { data: identity } = await admin
      .from("account_auth_identities")
      .select("auth_user_id,auth_email")
      .eq("normalized_username", identifier)
      .maybeSingle();

    if (!identity) {
      await writeAuditLog(null, { actionType: "login_failed", moduleKey: "auth", description: "账号登录失败", success: false });
      return NextResponse.json({ error: "账号或密码错误。" }, { status: 401 });
    }

    const { data: profileData } = await admin
      .from("user_profiles")
      .select("auth_user_id,workspace_owner_id,username,display_name,account_type,status,property_access_mode,must_change_password,sessions_revoked_at,last_login_at,last_activity_at,disabled_at,disabled_by,created_at,updated_at")
      .eq("auth_user_id", identity.auth_user_id)
      .maybeSingle();
    if (!profileData || profileData.status !== "active") {
      await writeAuditLog(null, { actionType: "login_failed", moduleKey: "auth", description: "账号登录失败", success: false });
      return NextResponse.json({ error: "账号或密码错误。" }, { status: 401 });
    }

    const authClient = getSupabasePublicServerClient();
    const { data: authData, error: loginError } = await authClient.auth.signInWithPassword({
      email: identity.auth_email,
      password
    });
    if (loginError || !authData.session || authData.user?.id !== identity.auth_user_id) {
      await writeAuditLog(null, { actionType: "login_failed", moduleKey: "auth", description: "账号登录失败", success: false });
      return NextResponse.json({ error: "账号或密码错误。" }, { status: 401 });
    }

    const sessionId = readSessionId(authData.session.access_token);
    const now = new Date().toISOString();
    if (sessionId) {
      await admin.from("app_sessions").upsert({
        session_id: sessionId,
        user_id: identity.auth_user_id,
        workspace_owner_id: profileData.workspace_owner_id,
        status: "active",
        created_at: now,
        last_seen_at: now,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        ip_address: (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null,
        user_agent: request.headers.get("user-agent")
      }, { onConflict: "session_id" });
    }
    await admin.from("user_profiles").update({ last_login_at: now, last_activity_at: now }).eq("auth_user_id", identity.auth_user_id);

    const context: AccountRequestContext = {
      accessToken: authData.session.access_token,
      userId: identity.auth_user_id,
      sessionId,
      profile: profileData,
      requestId: crypto.randomUUID(),
      ipAddress: (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent")
    };
    await writeAuditLog(context, { actionType: "login_success", moduleKey: "auth", description: "账号登录成功" });

    return NextResponse.json({
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at,
      expiresIn: authData.session.expires_in,
      tokenType: authData.session.token_type
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
