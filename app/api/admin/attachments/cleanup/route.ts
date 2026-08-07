import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, requireSensitivePermission, writeAuditLog } from "@/lib/server/account-auth";
import { cleanupAttachmentIds, cleanupTenantAttachments } from "@/lib/server/attachment-cleanup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const body = await parseJson(request) as { tenantIds?: unknown; attachmentIds?: unknown; confirmation?: unknown };
    const tenantIds = Array.isArray(body.tenantIds) ? body.tenantIds.filter((value): value is string => typeof value === "string" && Boolean(value)) : [];
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.filter((value): value is string => typeof value === "string" && Boolean(value)) : [];
    if (body.confirmation !== true || (!tenantIds.length && !attachmentIds.length)) {
      return NextResponse.json({ error: "请先确认已完成本地归档。" }, { status: 400 });
    }
    const report = attachmentIds.length ? await cleanupAttachmentIds(context.profile.workspace_owner_id, attachmentIds) : await cleanupTenantAttachments(context.profile.workspace_owner_id, tenantIds);
    await writeAuditLog(context, {
      actionType: "cleanup_attachments",
      moduleKey: "attachments",
      entityType: "tenant",
      entityId: tenantIds[0] || null,
      description: `清理云端附件：计划 ${report.planned} 个，删除 ${report.deleted} 个，失败 ${report.failed} 个，跳过 ${report.skippedGoogleDrive} 个。`,
      logCategory: "business"
    });
    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
