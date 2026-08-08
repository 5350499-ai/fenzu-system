import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireManagedAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { loadAttachmentSummary } from "@/lib/server/attachment-management";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    requireManagedAccount(context, "附件归档与清理");
    await requireSensitivePermission(context, "can_manage_settings");
    const summary = await loadAttachmentSummary(context.profile.workspace_owner_id);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
