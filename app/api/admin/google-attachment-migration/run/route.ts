import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { executeGoogleAttachmentMigration, verifyMigrationPreviewToken } from "@/lib/server/google-attachment-migration";

function enabled() {
  return process.env.GOOGLE_ATTACHMENT_MIGRATION_ENABLED === "true";
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    if (!enabled()) return NextResponse.json({ error: "Google Drive 迁移功能尚未启用。" }, { status: 403 });
    const body = await request.json().catch(() => null) as { previewToken?: string } | null;
    if (!body?.previewToken) return NextResponse.json({ error: "缺少迁移预览令牌。" }, { status: 400 });
    const previewPayload = verifyMigrationPreviewToken(body.previewToken, { userId: context.userId, workspaceId: context.profile.workspace_owner_id });
    const result = await executeGoogleAttachmentMigration({ workspaceId: context.profile.workspace_owner_id, userId: context.userId, previewPayload });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
