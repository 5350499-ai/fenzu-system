import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { restoreAttachmentEntry } from "@/lib/server/attachment-restore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const form = await request.formData();
    const entryText = form.get("entry");
    const file = form.get("file");
    if (typeof entryText !== "string" || !(file instanceof File)) return NextResponse.json({ error: "附件恢复请求不完整。" }, { status: 400 });
    const entry = JSON.parse(entryText);
    const result = await restoreAttachmentEntry(entry, new Uint8Array(await file.arrayBuffer()), context.profile.workspace_owner_id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[attachment-restore-item] failed", error);
    return apiErrorResponse(error);
  }
}
