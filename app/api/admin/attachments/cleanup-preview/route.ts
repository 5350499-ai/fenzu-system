import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { loadAttachmentCleanupPreview } from "@/lib/server/attachment-cleanup";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const thresholdMonths = Number(new URL(request.url).searchParams.get("thresholdMonths"));
    const preview = await loadAttachmentCleanupPreview(context.profile.workspace_owner_id, thresholdMonths, context.accessToken);
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
