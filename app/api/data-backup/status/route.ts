import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireDataBackupExportPermission } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireDataBackupExportPermission(context);
    const { data, error } = await getSupabaseAdmin()
      .from("audit_logs")
      .select("created_at")
      .eq("action_type", "successful_data_backup_export")
      .eq("module_key", "data_center")
      .eq("entity_type", "workspace")
      .eq("entity_id", context.profile.workspace_owner_id)
      .eq("success", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("加载备份记录失败");
    return NextResponse.json({ lastSuccessfulBackupAt: data?.created_at || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
