import { apiErrorResponse, parseJson, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { runAttachmentCleanupSkeleton } from "@/lib/server/attachment-cleanup";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const body = await parseJson(request) as { previewToken?: string; thresholdMonths?: number };
    await runAttachmentCleanupSkeleton(body);
    return Response.json({ ok: false }, { status: 403 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
