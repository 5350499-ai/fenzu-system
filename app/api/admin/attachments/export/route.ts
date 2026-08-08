import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireManagedAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { createAttachmentZipExport } from "@/lib/server/attachment-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    requireManagedAccount(context, "附件归档与清理");
    await requireSensitivePermission(context, "can_manage_settings");
    const result = await createAttachmentZipExport(context.profile.workspace_owner_id);
    return new NextResponse(result.bytes as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
        "X-Attachment-Count": String(result.manifest.attachmentCount),
        "X-Attachment-Exported": String(result.manifest.exportedCount),
        "X-Attachment-Skipped": String(result.manifest.skippedCount),
        "X-Attachment-Manifest-Version": String(result.manifest.manifestVersion)
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
