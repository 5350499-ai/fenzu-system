import { apiErrorResponse, requireActiveAccount, requireSensitivePermission, AccountApiError } from "@/lib/server/account-auth";
import { ATTACHMENT_ARCHIVE_ENABLED } from "@/lib/attachment-archive";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    if (!ATTACHMENT_ARCHIVE_ENABLED) throw new AccountApiError("ZIP归档功能尚未启用。", 403);
    return Response.json({ ok: false }, { status: 403 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
