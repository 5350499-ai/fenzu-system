import { NextResponse } from "next/server";
import {
  AccountApiError,
  apiErrorResponse,
  parseJson,
  requireActiveAccount,
  revokeAllAppSessions,
  writeAuditLog
} from "@/lib/server/account-auth";
import { validatePassword } from "@/lib/server/account-management";
import { getSupabaseAdmin, getSupabasePublicServerClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof requireActiveAccount>> | null = null;
  let failureLogged = false;

  try {
    context = await requireActiveAccount(request);
    const body = await parseJson(request) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      passwordConfirmation?: unknown;
    };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = validatePassword(body.newPassword, body.passwordConfirmation);

    if (!currentPassword) {
      throw new AccountApiError("当前密码不正确。", 400);
    }
    if (currentPassword === newPassword) {
      throw new AccountApiError("新密码不能与当前密码相同。", 400);
    }

    const admin = getSupabaseAdmin();
    const { data: identity, error: identityError } = await admin
      .from("account_auth_identities")
      .select("auth_email")
      .eq("auth_user_id", context.userId)
      .maybeSingle();

    if (identityError || !identity?.auth_email) {
      throw new AccountApiError("账号认证信息不可用，请联系主管理员。", 500);
    }

    // Sign in on a non-persistent server client to verify only the submitted
    // current password. Neither password nor the generated session is returned.
    const authClient = getSupabasePublicServerClient();
    const { data: verified, error: verifyError } = await authClient.auth.signInWithPassword({
      email: identity.auth_email,
      password: currentPassword
    });

    if (verifyError || verified.user?.id !== context.userId) {
      await writeAuditLog(context, {
        actionType: "self_password_change_failed",
        moduleKey: "auth",
        entityType: "user_profile",
        entityId: context.userId,
        description: "修改自己的密码失败：当前密码验证未通过",
        success: false
      });
      failureLogged = true;
      throw new AccountApiError("当前密码不正确。", 400);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(context.userId, {
      password: newPassword
    });
    if (updateError) {
      throw new AccountApiError("密码修改失败，请稍后重试。", 500);
    }

    // The temporary verifier client is authenticated as this user, so a global
    // sign-out revokes Supabase refresh tokens without exposing them to clients.
    await authClient.auth.signOut({ scope: "global" }).catch(() => undefined);
    await revokeAllAppSessions(context.userId, context.userId, "self_password_changed");
    await writeAuditLog(context, {
      actionType: "self_password_changed",
      moduleKey: "auth",
      entityType: "user_profile",
      entityId: context.userId,
      description: "用户修改自己的密码；全部应用会话已撤销"
    });

    return NextResponse.json({ ok: true, requireRelogin: true });
  } catch (error) {
    if (context && !failureLogged) {
      await writeAuditLog(context, {
        actionType: "self_password_change_failed",
        moduleKey: "auth",
        entityType: "user_profile",
        entityId: context.userId,
        description: "修改自己的密码失败",
        success: false
      }).catch(() => undefined);
    }
    return apiErrorResponse(error);
  }
}
