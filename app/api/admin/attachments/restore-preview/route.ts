import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { previewAttachmentZipRestore } from "@/lib/server/attachment-restore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择 attachments.zip 文件。" }, { status: 400 });
    const result = await previewAttachmentZipRestore(new Uint8Array(await file.arrayBuffer()), context.profile.workspace_owner_id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
