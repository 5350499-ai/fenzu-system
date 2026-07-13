import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, revokeAllAppSessions, writeAuditLog } from "@/lib/server/account-auth";
import { validatePassword } from "@/lib/server/account-management";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const OWNER_ID = "57b1a78b-d3fe-4e6f-bd9a-055ce1527936";

async function getCustomTarget(id: string) {
  if (id === OWNER_ID) throw new AccountApiError("主管理员账号不可执行此操作。", 403);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("user_profiles")
    .select("auth_user_id,display_name,username,account_type,status")
    .eq("auth_user_id", id)
    .maybeSingle();
  const account = data as { auth_user_id: string; display_name: string; username: string; account_type: string; status: string } | null;
  if (error || !account || account.account_type !== "custom") throw new AccountApiError("未找到可管理的自定义账号。", 404);
  return account;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as { action?: string; password?: unknown; passwordConfirmation?: unknown };
    const { id } = await params;
    const target = await getCustomTarget(id);
    const admin = getSupabaseAdmin();

    if (body.action === "reset_password") {
      const password = validatePassword(body.password, body.passwordConfirmation);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw new AccountApiError("重置密码失败，请稍后重试。", 500);
      await revokeAllAppSessions(id, context.userId, "password_reset");
      await writeAuditLog(context, { actionType: "password_reset", moduleKey: "accounts", entityType: "user_profile", entityId: id, description: `为账号 ${target.display_name} 重置密码` });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "disable") {
      const now = new Date().toISOString();
      const { error: profileError } = await admin
        .from("user_profiles")
        .update({ status: "disabled", disabled_at: now, disabled_by: context.userId, updated_by: context.userId })
        .eq("auth_user_id", id);
      if (profileError) throw new AccountApiError("停用账号失败。", 500);
      const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      if (authError) throw new AccountApiError("停用登录账号失败。", 500);
      await revokeAllAppSessions(id, context.userId, "account_disabled");
      await writeAuditLog(context, { actionType: "account_disabled", moduleKey: "accounts", entityType: "user_profile", entityId: id, description: `停用账号：${target.display_name}` });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "enable") {
      const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (authError) throw new AccountApiError("启用登录账号失败。", 500);
      const { error: profileError } = await admin
        .from("user_profiles")
        .update({ status: "active", disabled_at: null, disabled_by: null, updated_by: context.userId, sessions_revoked_at: new Date().toISOString() })
        .eq("auth_user_id", id);
      if (profileError) throw new AccountApiError("启用账号失败。", 500);
      await writeAuditLog(context, { actionType: "account_enabled", moduleKey: "accounts", entityType: "user_profile", entityId: id, description: `启用账号：${target.display_name}` });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "force_sign_out") {
      await revokeAllAppSessions(id, context.userId, "forced_sign_out");
      await writeAuditLog(context, { actionType: "force_sign_out", moduleKey: "accounts", entityType: "user_profile", entityId: id, description: `强制账号退出全部设备：${target.display_name}` });
      return NextResponse.json({ ok: true });
    }

    throw new AccountApiError("不支持的账号安全操作。", 400);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
