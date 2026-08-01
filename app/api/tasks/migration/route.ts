import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { isTasksServerSyncEnabled, type LocalTaskLike } from "@/lib/task-management";
import { migrateLocalTasks } from "@/lib/server/task-management";

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "create");
    if (!isTasksServerSyncEnabled()) throw new AccountApiError("服务端待办迁移功能尚未启用。", 403);
    const body = await parseJson(request) as { tasks?: unknown; previewToken?: unknown; confirmed?: unknown };
    if (body.confirmed !== true) throw new AccountApiError("请先确认本次待办迁移。", 400);
    if (!Array.isArray(body.tasks) || body.tasks.length > 500 || typeof body.previewToken !== "string") {
      throw new AccountApiError("迁移请求格式不正确。", 400);
    }
    const result = await migrateLocalTasks(context, body.tasks as LocalTaskLike[], body.previewToken);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
