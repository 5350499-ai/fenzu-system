import { NextResponse } from "next/server";
import { requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { previewAttachmentManifestRestore } from "@/lib/server/attachment-restore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const body = await request.json();
    const result = await previewAttachmentManifestRestore(body?.manifest, context.profile.workspace_owner_id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[attachment-restore-preview] failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件恢复预览失败。" }, { status: 400 });
  }
}
