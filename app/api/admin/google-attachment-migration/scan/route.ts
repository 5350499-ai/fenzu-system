import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { scanGoogleAttachments } from "@/lib/server/google-attachment-migration";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const result = await scanGoogleAttachments(context.profile.workspace_owner_id, context.userId);
    return NextResponse.json({
      scannedAt: result.scannedAt,
      expiresAt: result.expiresAt,
      previewToken: result.previewToken,
      summary: result.summary,
      items: result.items.map((item) => ({
        attachmentId: item.attachmentId,
        table: item.table,
        fileName: item.fileName,
        databaseMime: item.databaseMime,
        databaseSize: item.databaseSize,
        sourceStatus: item.sourceStatus,
        driveMime: item.driveMime,
        driveSize: item.driveSize,
        targetBucket: item.targetBucket,
        targetStatus: item.targetStatus,
        readable: item.readable,
        migratable: item.migratable,
        reason: item.reason,
        providerFingerprint: item.providerFingerprint
      }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
