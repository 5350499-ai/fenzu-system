import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createDataBackup } from "@/lib/server/backup-service";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_export_data");
    const payload = await createDataBackup(getSupabaseAdmin(), context.profile.workspace_owner_id, {
      backupType: "local",
      exportedBy: context.userId,
      timezone: "UTC",
      exportReason: "Manual"
    });
    return NextResponse.json({ payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
