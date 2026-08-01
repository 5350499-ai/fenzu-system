import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { TASKS_SERVER_SYNC_ENABLED, type LocalTaskLike } from "@/lib/task-management";
import { buildServerTaskMigrationPreview, loadServerTasksForContext } from "@/lib/server/task-management";

function requireServerTasksEnabled() {
  if (!TASKS_SERVER_SYNC_ENABLED) throw new AccountApiError("服务端待办迁移功能尚未启用。", 403);
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "view");
    requireServerTasksEnabled();
    const tasks = await loadServerTasksForContext(context);
    return NextResponse.json({ enabled: true, serverTasks: { available: true, count: tasks.length } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "view");
    requireServerTasksEnabled();
    const body = await parseJson(request) as { tasks?: unknown };
    if (!Array.isArray(body.tasks)) throw new AccountApiError("本地待办数据格式不正确。", 400);
    if (body.tasks.length > 500) throw new AccountApiError("一次最多预览500条本地待办。", 400);
    const preview = await buildServerTaskMigrationPreview(context, body.tasks as LocalTaskLike[]);
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
