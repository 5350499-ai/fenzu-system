import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";

export type AccountProfileRow = {
  auth_user_id: string;
  workspace_owner_id: string;
  username: string;
  display_name: string;
  account_type: "owner" | "custom";
  status: "active" | "disabled";
  property_access_mode: "all" | "selected";
  must_change_password: boolean;
  sessions_revoked_at: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
  created_at: string;
  updated_at: string;
};

export class AccountApiError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

type JwtClaims = { session_id?: string; iat?: number };

export type AccountRequestContext = {
  accessToken: string;
  userId: string;
  sessionId: string | null;
  profile: AccountProfileRow;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export function apiErrorResponse(error: unknown) {
  if (error instanceof AccountApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "服务暂时不可用，请稍后重试。";
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return NextResponse.json({ error: "账号管理服务尚未配置，请联系主管理员。" }, { status: 503 });
  }

  return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 500 });
}

function getBearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7).trim() : "";
  if (!token) throw new AccountApiError("登录已失效，请重新登录。", 401);
  return token;
}

function decodeJwtClaims(token: string): JwtClaims {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as JwtClaims;
  } catch {
    return {};
  }
}

function toIsoSeconds(value: string | null) {
  return value ? Math.floor(new Date(value).getTime() / 1000) : 0;
}

function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]?.trim() || null : null;
}

function assertSessionIssuedAfterRevocation(profile: AccountProfileRow, issuedAt: number) {
  if (!profile.sessions_revoked_at) return;
  if (issuedAt <= toIsoSeconds(profile.sessions_revoked_at)) {
    throw new AccountApiError("当前会话已被撤销，请重新登录。", 401);
  }
}

/** Restores a missing application-session row after Supabase restores local storage. */
export async function restoreApplicationSession(request: Request): Promise<AccountRequestContext> {
  const token = getBearerToken(request);
  const verifier = getSupabaseAuthVerifier(token);
  const { data: userData, error: userError } = await verifier.auth.getUser(token);
  if (userError || !userData.user) throw new AccountApiError("登录已失效，请重新登录。", 401);

  const admin = getSupabaseAdmin();
  const { data: profileData, error: profileError } = await admin
    .from("user_profiles")
    .select("auth_user_id,workspace_owner_id,username,display_name,account_type,status,property_access_mode,must_change_password,sessions_revoked_at,last_login_at,last_activity_at,disabled_at,disabled_by,created_at,updated_at")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (profileError || !profileData) throw new AccountApiError("当前账号未完成授权配置。", 403);

  const profile = profileData as AccountProfileRow;
  if (profile.status !== "active") throw new AccountApiError("该账号已停用，请联系主管理员。", 403);

  const claims = decodeJwtClaims(token);
  const sessionId = claims.session_id || null;
  const issuedAt = Number(claims.iat || 0);
  if (!sessionId) throw new AccountApiError("当前会话无效，请重新登录。", 401);

  const { data: sessionRow, error: sessionError } = await admin
    .from("app_sessions")
    .select("status")
    .eq("session_id", sessionId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (sessionError) throw new AccountApiError("会话校验失败，请重新登录。", 401);
  if (sessionRow?.status === "revoked") throw new AccountApiError("当前会话已被撤销，请重新登录。", 401);

  const now = new Date().toISOString();
  if (!sessionRow) {
    // A missing row may be a persisted session restored after a PWA/browser
    // restart. A session issued before a global revoke must not be recreated.
    assertSessionIssuedAfterRevocation(profile, issuedAt);
    const { error: restoreError } = await admin.from("app_sessions").insert({
      session_id: sessionId,
      user_id: userData.user.id,
      workspace_owner_id: profile.workspace_owner_id,
      status: "active",
      created_at: now,
      last_seen_at: now,
      ip_address: requestIp(request),
      user_agent: request.headers.get("user-agent")
    });
    if (restoreError) {
      // Another browser tab can restore the same persisted Supabase session at
      // the same time. Accept only an already-active row; never revive one
      // that was explicitly revoked.
      const { data: concurrentSession } = await admin
        .from("app_sessions")
        .select("status")
        .eq("session_id", sessionId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (concurrentSession?.status !== "active") {
        throw new AccountApiError("无法恢复登录会话，请重新登录。", 401);
      }
    }
  }

  await admin.from("app_sessions").update({ last_seen_at: now }).eq("session_id", sessionId).eq("status", "active");

  await admin.from("user_profiles").update({ last_activity_at: now }).eq("auth_user_id", userData.user.id);
  return {
    accessToken: token,
    userId: userData.user.id,
    sessionId,
    profile,
    requestId: randomUUID(),
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent")
  };
}

export async function requireActiveAccount(request: Request, ownerOnly = false): Promise<AccountRequestContext> {
  const token = getBearerToken(request);
  const verifier = getSupabaseAuthVerifier(token);
  const { data: userData, error: userError } = await verifier.auth.getUser(token);
  if (userError || !userData.user) throw new AccountApiError("登录已失效，请重新登录。", 401);

  const admin = getSupabaseAdmin();
  const { data: profileData, error: profileError } = await admin
    .from("user_profiles")
    .select("auth_user_id,workspace_owner_id,username,display_name,account_type,status,property_access_mode,must_change_password,sessions_revoked_at,last_login_at,last_activity_at,disabled_at,disabled_by,created_at,updated_at")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profileData) throw new AccountApiError("当前账号未完成授权配置。", 403);
  const profile = profileData as AccountProfileRow;
  if (profile.status !== "active") throw new AccountApiError("该账号已停用，请联系主管理员。", 403);

  const claims = decodeJwtClaims(token);
  const sessionId = claims.session_id || null;
  const issuedAt = Number(claims.iat || 0);
  // Custom accounts are checked against their exact app session below. The
  // timestamp guard remains for the legacy owner session path.
  if (profile.account_type === "owner") assertSessionIssuedAfterRevocation(profile, issuedAt);

  if (sessionId) {
    const { data: sessionRow, error: sessionError } = await admin
      .from("app_sessions")
      .select("status")
      .eq("session_id", sessionId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sessionError) throw new AccountApiError("会话校验失败，请重新登录。", 401);
    if (sessionRow?.status === "revoked") throw new AccountApiError("当前会话已被撤销，请重新登录。", 401);
    if (profile.account_type === "custom" && sessionRow?.status !== "active") {
      throw new AccountApiError("当前会话无效，请重新登录。", 401);
    }
  } else if (profile.account_type === "custom") {
    throw new AccountApiError("当前会话无效，请重新登录。", 401);
  }

  if (ownerOnly && profile.account_type !== "owner") {
    throw new AccountApiError("没有权限执行此操作。", 403);
  }

  await admin
    .from("user_profiles")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("auth_user_id", userData.user.id);

  if (sessionId) {
    await admin
      .from("app_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .eq("status", "active");
  }

  return {
    accessToken: token,
    userId: userData.user.id,
    sessionId,
    profile,
    requestId: randomUUID(),
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent")
  };
}

export async function requireModulePermission(context: AccountRequestContext, moduleKey: string, action: "view" | "create" | "edit" | "archive" | "delete" = "view") {
  if (context.profile.account_type === "owner") return;
  const column = action === "view" ? "can_view" : action === "create" ? "can_create" : action === "edit" ? "can_edit" : action === "archive" ? "can_archive" : "can_delete";
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("user_permissions").select(column).eq("user_id", context.userId).eq("module_key", moduleKey).maybeSingle();
  if (!data || !Boolean((data as Record<string, unknown>)[column])) throw new AccountApiError("没有权限执行此操作。", 403);
}

export async function requireSensitivePermission(context: AccountRequestContext, permissionColumn: string) {
  if (context.profile.account_type === "owner") return;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("user_sensitive_permissions").select(permissionColumn).eq("user_id", context.userId).maybeSingle();
  if (!data || !Boolean((data as unknown as Record<string, unknown>)[permissionColumn])) throw new AccountApiError("没有权限执行此操作。", 403);
}

export async function requirePropertyAccess(context: AccountRequestContext, propertyId: string | null | undefined) {
  if (context.profile.account_type === "owner" || context.profile.property_access_mode === "all") return;
  if (!propertyId) throw new AccountApiError("该记录不在当前账号的房源授权范围内。", 403);
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("user_property_access").select("property_id").eq("user_id", context.userId).eq("property_id", propertyId).maybeSingle();
  if (!data) throw new AccountApiError("该记录不在当前账号的房源授权范围内。", 403);
}

const SENSITIVE_KEY_PATTERN = /password|token|authorization|cookie|secret|service_role|api[_-]?key/i;

export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (!value || typeof value !== "object") return value;

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((result, [key, item]) => {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[已过滤]" : sanitizeAuditData(item);
    return result;
  }, {});
}

export async function writeAuditLog(
  context: AccountRequestContext | null,
  input: {
    actionType: string;
    moduleKey: string;
    entityType?: string;
    entityId?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    description: string;
    success?: boolean;
    logCategory?: "business" | "security";
  }
) {
  const admin = getSupabaseAdmin();
  await admin.from("audit_logs").insert({
    log_category: input.logCategory || "security",
    actor_user_id: context?.userId || null,
    actor_username: context?.profile.username || null,
    actor_display_name: context?.profile.display_name || null,
    session_id: context?.sessionId || null,
    action_type: input.actionType,
    module_key: input.moduleKey,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    before_data: input.beforeData ? sanitizeAuditData(input.beforeData) : null,
    after_data: input.afterData ? sanitizeAuditData(input.afterData) : null,
    description: input.description,
    success: input.success ?? true,
    request_id: context?.requestId || null,
    ip_address: context?.ipAddress || null,
    user_agent: context?.userAgent || null
  });
}

export async function revokeAllAppSessions(targetUserId: string, actorUserId: string, reason: string) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error: profileError } = await admin
    .from("user_profiles")
    .update({ sessions_revoked_at: now, updated_by: actorUserId })
    .eq("auth_user_id", targetUserId);
  if (profileError) throw new AccountApiError("撤销账号会话失败。", 500);

  const { error: sessionError } = await admin
    .from("app_sessions")
    .update({ status: "revoked", revoked_at: now, revoked_by: actorUserId, revoke_reason: reason })
    .eq("user_id", targetUserId)
    .eq("status", "active");
  if (sessionError) throw new AccountApiError("撤销账号会话失败。", 500);
}

export async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AccountApiError("请求数据格式不正确。", 400);
  }
}
