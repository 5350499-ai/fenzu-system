import { NextResponse } from "next/server";
import { emptyModulePermissions } from "@/lib/account-permissions";
import { apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";
import { clientSensitivePermissions, createCustomAccount } from "@/lib/server/account-management";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function mapPermissions(rows: Array<Record<string, unknown>>, userId: string) {
  const byKey = new Map(rows.filter((row) => row.user_id === userId).map((row) => [row.module_key, row]));
  return emptyModulePermissions().map((base) => {
    const row = byKey.get(base.moduleKey);
    return {
      moduleKey: base.moduleKey,
      canView: Boolean(row?.can_view),
      canCreate: Boolean(row?.can_create),
      canEdit: Boolean(row?.can_edit),
      canArchive: Boolean(row?.can_archive),
      canDelete: Boolean(row?.can_delete)
    };
  });
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const admin = getSupabaseAdmin();
    const [profilesResult, permissionsResult, sensitiveResult, accessResult, propertyResult, logsResult] = await Promise.all([
      admin.from("user_profiles").select("auth_user_id,username,display_name,account_type,status,property_access_mode,must_change_password,last_login_at,last_activity_at,disabled_at").eq("workspace_owner_id", context.profile.workspace_owner_id).order("created_at", { ascending: true }),
      admin.from("user_permissions").select("user_id,module_key,can_view,can_create,can_edit,can_archive,can_delete"),
      admin.from("user_sensitive_permissions").select("*"),
      admin.from("user_property_access").select("user_id,property_id"),
      admin.from("properties").select("id,name,address,city").eq("user_id", context.profile.workspace_owner_id).order("name", { ascending: true }),
      admin.from("audit_logs").select("actor_user_id,created_at").eq("success", true).order("created_at", { ascending: false }).limit(500)
    ]);
    if (profilesResult.error || permissionsResult.error || sensitiveResult.error || accessResult.error || propertyResult.error || logsResult.error) {
      throw new Error("加载账号资料失败");
    }

    const latestAction = new Map<string, string>();
    (logsResult.data || []).forEach((row) => {
      if (row.actor_user_id && !latestAction.has(row.actor_user_id)) latestAction.set(row.actor_user_id, row.created_at);
    });
    const accessByUser = new Map<string, string[]>();
    (accessResult.data || []).forEach((row) => {
      accessByUser.set(row.user_id, [...(accessByUser.get(row.user_id) || []), row.property_id]);
    });
    const sensitiveByUser = new Map((sensitiveResult.data || []).map((row) => [row.user_id, row as Record<string, boolean>]));

    const accounts = (profilesResult.data || []).map((profile) => ({
      id: profile.auth_user_id,
      username: profile.username,
      displayName: profile.display_name,
      accountType: profile.account_type,
      status: profile.status,
      propertyAccessMode: profile.property_access_mode,
      propertyIds: accessByUser.get(profile.auth_user_id) || [],
      mustChangePassword: profile.must_change_password,
      lastLoginAt: profile.last_login_at,
      lastActivityAt: profile.last_activity_at,
      latestActionAt: latestAction.get(profile.auth_user_id) || null,
      disabledAt: profile.disabled_at,
      modulePermissions: mapPermissions((permissionsResult.data || []) as Array<Record<string, unknown>>, profile.auth_user_id),
      sensitivePermissions: clientSensitivePermissions(sensitiveByUser.get(profile.auth_user_id) || null)
    }));

    return NextResponse.json({
      accounts,
      properties: (propertyResult.data || []).map((property) => ({ id: property.id, name: property.name, address: property.address, city: property.city }))
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request);
    const id = await createCustomAccount(context, body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
