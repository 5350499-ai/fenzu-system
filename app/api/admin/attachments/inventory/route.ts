import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { loadAttachmentInventory } from "@/lib/server/attachment-cleanup";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_manage_settings");
    const items = await loadAttachmentInventory(context.profile.workspace_owner_id);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
