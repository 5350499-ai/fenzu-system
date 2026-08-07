import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { cleanupTenantAttachments } from "@/lib/server/attachment-cleanup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const body = await parseJson(request) as { tenantId?: unknown; confirmation?: unknown };
    if (body.confirmation !== true || typeof body.tenantId !== "string" || !body.tenantId) {
      return NextResponse.json({ error: "请先确认已完成本地归档。" }, { status: 400 });
    }
    const report = await cleanupTenantAttachments(context.profile.workspace_owner_id, body.tenantId);
    await writeAuditLog(context, {
      actionType: "cleanup_attachments",
      moduleKey: "attachments",
      entityType: "tenant",
      entityId: body.tenantId,
      description: `清理租客 ${body.tenantId} 的云端附件：删除 ${report.deleted} 个，失败 ${report.failed} 个，跳过 ${report.skippedGoogleDrive} 个。`,
      logCategory: "business"
    });
    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
