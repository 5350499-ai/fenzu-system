import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { TASKS_SERVER_SYNC_ENABLED } from "@/lib/task-management";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "create");
    if (!TASKS_SERVER_SYNC_ENABLED) throw new AccountApiError("服务端待办迁移功能尚未启用。", 403);
    void context;
    return NextResponse.json({ ok: false }, { status: 501 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
