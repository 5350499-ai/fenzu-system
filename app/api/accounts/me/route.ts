import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount } from "@/lib/server/account-auth";
import { emptyModulePermissions } from "@/lib/account-permissions";
import { clientSensitivePermissions } from "@/lib/server/account-management";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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
    const modulePermissions = emptyModulePermissions().map((base) => {
      const row = byModule.get(base.moduleKey);
      return context.profile.account_type === "owner"
        ? { ...base, canView: true, canCreate: true, canEdit: true, canArchive: true, canDelete: true }
        : { moduleKey: base.moduleKey, canView: Boolean(row?.can_view), canCreate: Boolean(row?.can_create), canEdit: Boolean(row?.can_edit), canArchive: Boolean(row?.can_archive), canDelete: Boolean(row?.can_delete) };
    });
    return NextResponse.json({
      profile: {
        id: context.profile.auth_user_id,
        username: context.profile.username || "",
        displayName: context.profile.display_name || "",
        accountType: context.profile.account_type,
        status: context.profile.status,
        workspaceOwnerId: context.profile.workspace_owner_id || "",
        propertyAccessMode: context.profile.property_access_mode,
        mustChangePassword: context.profile.must_change_password
      },
      isOwner: context.profile.account_type === "owner",
      modulePermissions,
      sensitivePermissions: context.profile.account_type === "owner"
        ? Object.fromEntries(Object.keys(clientSensitivePermissions(null)).map((key) => [key, true]))
        : clientSensitivePermissions(sensitiveResult.data),
      propertyIds: (propertyResult.data || [])
        .map((row) => row.property_id)
        .filter((propertyId): propertyId is string => typeof propertyId === "string" && propertyId.length > 0)
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
