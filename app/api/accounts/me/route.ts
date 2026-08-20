import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, isFreeSingleAccount, parseJson, requireActiveAccount, writeAuditLog } from "@/lib/server/account-auth";
import { isFreeSingleRestrictedModule, isFreeSingleRestrictedSensitivePermission } from "@/lib/free-single";
import { emptyModulePermissions } from "@/lib/account-permissions";
import { clientSensitivePermissions } from "@/lib/server/account-management";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_ACCOUNT_DISPLAY_NAME, normalizeSelfDisplayNameUpdate } from "@/lib/self-profile";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const admin = getSupabaseAdmin();
    const [moduleResult, sensitiveResult, propertyResult] = await Promise.all([
      admin.from("user_permissions").select("module_key,can_view,can_create,can_edit,can_archive,can_delete").eq("user_id", context.userId),
      admin.from("user_sensitive_permissions").select("*").eq("user_id", context.userId).maybeSingle(),
      admin.from("user_property_access").select("property_id").eq("user_id", context.userId)
    ]);
    if (moduleResult.error || sensitiveResult.error || propertyResult.error) throw new Error("加载当前账号权限失败");
    const byModule = new Map((moduleResult.data || [])
      .filter((row) => typeof row.module_key === "string")
      .map((row) => [row.module_key, row]));
    const freeSingle = isFreeSingleAccount(context);
    const modulePermissions = emptyModulePermissions().map((base) => {
      const row = byModule.get(base.moduleKey);
      if (freeSingle && isFreeSingleRestrictedModule(base.moduleKey)) return { ...base, canView: false, canCreate: false, canEdit: false, canArchive: false, canDelete: false };
      if (freeSingle && base.moduleKey === "audit_logs") return { ...base, canView: true, canCreate: false, canEdit: false, canArchive: false, canDelete: false };
      return context.profile.account_type === "owner"
        ? { ...base, canView: true, canCreate: true, canEdit: true, canArchive: true, canDelete: true }
        : { moduleKey: base.moduleKey, canView: Boolean(row?.can_view), canCreate: Boolean(row?.can_create), canEdit: Boolean(row?.can_edit), canArchive: Boolean(row?.can_archive), canDelete: Boolean(row?.can_delete) };
    });
    const workspaceProfileResult = await admin.from("user_profiles").select("currency_code").eq("auth_user_id", context.profile.workspace_owner_id).maybeSingle();
    const currencyCode = workspaceProfileResult.error?.code === "42703" ? "EUR" : (workspaceProfileResult.data?.currency_code || "EUR");
    return NextResponse.json({
      profile: {
        id: context.profile.auth_user_id,
        username: context.profile.username || "",
        displayName: context.profile.display_name || DEFAULT_ACCOUNT_DISPLAY_NAME,
        accountType: context.profile.account_type,
        accountPlan: context.profile.account_plan,
        status: context.profile.status,
        workspaceOwnerId: context.profile.workspace_owner_id || "",
        propertyAccessMode: context.profile.property_access_mode,
        mustChangePassword: context.profile.must_change_password
      },
      currencyCode,
      isOwner: context.profile.account_type === "owner",
      modulePermissions,
      sensitivePermissions: context.profile.account_type === "owner"
        ? Object.fromEntries(Object.keys(clientSensitivePermissions(null)).map((key) => [key, true]))
        : Object.fromEntries(Object.entries(clientSensitivePermissions(sensitiveResult.data)).map(([key, value]) => [key, freeSingle ? (isFreeSingleRestrictedSensitivePermission(key) ? false : value) : value])),
      propertyIds: (propertyResult.data || [])
        .map((row) => row.property_id)
        .filter((propertyId): propertyId is string => typeof propertyId === "string" && propertyId.length > 0)
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    let update: { displayName: string };
    try {
      update = normalizeSelfDisplayNameUpdate(await parseJson(request));
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_SELF_PROFILE_UPDATE";
      if (code === "DISPLAY_NAME_REQUIRED") throw new AccountApiError("显示名称不能为空。", 400, "display_name_required");
      if (code === "DISPLAY_NAME_TOO_LONG") throw new AccountApiError("显示名称不能超过80个字符。", 400, "display_name_too_long");
      throw new AccountApiError("只能修改当前账号的显示名称。", 400, "self_profile_fields_only");
    }

    const before = context.profile.display_name || DEFAULT_ACCOUNT_DISPLAY_NAME;
    if (update.displayName === before) return NextResponse.json({ ok: true, displayName: before });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("user_profiles")
      .update({ display_name: update.displayName, updated_by: context.userId })
      .eq("auth_user_id", context.userId)
      .eq("workspace_owner_id", context.profile.workspace_owner_id)
      .select("auth_user_id,display_name")
      .maybeSingle();
    if (error) throw new Error("保存显示名称失败");
    if (!data || data.auth_user_id !== context.userId) throw new AccountApiError("当前账号资料不存在。", 404, "profile_not_found");

    await writeAuditLog(context, {
      actionType: "update_own_display_name",
      moduleKey: "settings",
      entityType: "user_profile",
      entityId: context.userId,
      beforeData: { displayName: before },
      afterData: { displayName: data.display_name },
      description: "修改当前账号显示名称"
    });
    return NextResponse.json({ ok: true, displayName: data.display_name });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
