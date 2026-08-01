import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { verifyMigrationPreviewToken } from "@/lib/server/google-attachment-migration";

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
    verifyMigrationPreviewToken(body.previewToken, { userId: context.userId, workspaceId: context.profile.workspace_owner_id });
    return NextResponse.json({ error: "迁移执行通道尚未开放。" }, { status: 403 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
