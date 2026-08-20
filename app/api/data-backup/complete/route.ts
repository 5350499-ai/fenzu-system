import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireDataBackupExportPermission, writeAuditLog } from "@/lib/server/account-auth";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireDataBackupExportPermission(context);
    const completedAt = new Date().toISOString();
    await writeAuditLog(context, {
      actionType: "successful_data_backup_export",
      moduleKey: "data_center",
      entityType: "workspace",
      entityId: context.profile.workspace_owner_id,
      afterData: { workspaceOwnerId: context.profile.workspace_owner_id, backupType: "local", completedAt },
      description: "用户成功完成数据备份导出"
    });
    return NextResponse.json({ ok: true, lastSuccessfulBackupAt: completedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
