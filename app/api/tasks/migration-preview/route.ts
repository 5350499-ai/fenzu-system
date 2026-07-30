import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { TASKS_SERVER_SYNC_ENABLED } from "@/lib/task-management";
import { loadServerTasks } from "@/lib/server/task-management";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "view");
    const serverTasks = await loadServerTasks(context.profile.workspace_owner_id, context.accessToken);
    return NextResponse.json({ enabled: TASKS_SERVER_SYNC_ENABLED, serverTasks: { available: serverTasks.available, count: serverTasks.rows.length, reason: serverTasks.reason }, localTasks: { readFromBrowser: true, uploadReady: false, count: 0 }, message: "本地待办迁移需要在浏览器内生成预览；服务端不会读取或删除浏览器本地数据。" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
