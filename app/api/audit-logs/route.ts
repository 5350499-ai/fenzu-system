import { NextResponse } from "next/server";
import { apiErrorResponse, isFreeSingleAccount, requireActiveAccount, requireModulePermission, requireSensitivePermission } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const freeSingle = isFreeSingleAccount(context);
    if (!freeSingle) {
      await requireModulePermission(context, "audit_logs", "view");
      await requireSensitivePermission(context, "can_view_audit_logs");
    }
    const url = new URL(request.url);
    const actor = url.searchParams.get("actor")?.trim();
    const action = url.searchParams.get("action")?.trim();
    const moduleKey = url.searchParams.get("module")?.trim();
    const success = url.searchParams.get("success");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const admin = getSupabaseAdmin();

    let query = admin
      .from("audit_logs")
      .select("id,log_category,actor_user_id,actor_username,actor_display_name,action_type,module_key,entity_type,entity_id,before_data,after_data,description,success,created_at")
      .eq("success", true)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (freeSingle) query = query.eq("actor_user_id", context.userId);
    if (actor) query = query.ilike("actor_username", `%${actor}%`);
    if (action) query = query.ilike("action_type", `%${action}%`);
    if (moduleKey) query = query.eq("module_key", moduleKey);
    if (success === "true" || success === "false") query = query.eq("success", success === "true");
    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) throw error;
    if (freeSingle) return NextResponse.json({ logs: data || [] });
    const { data: workspaceUsers, error: workspaceError } = await admin
      .from("user_profiles")
      .select("auth_user_id")
      .eq("workspace_owner_id", context.profile.workspace_owner_id);
    if (workspaceError) throw workspaceError;
    const workspaceUserIdSet = new Set((workspaceUsers || []).map((item) => item.auth_user_id));
    const logs = (data || []).filter((row) => !row.actor_user_id || workspaceUserIdSet.has(row.actor_user_id));
    return NextResponse.json({ logs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
