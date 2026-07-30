import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { loadServerTasks } from "@/lib/server/task-management";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "view");
    const result = await loadServerTasks(context.profile.workspace_owner_id, context.accessToken);
    return NextResponse.json({ ...result, rows: result.rows.map(({ id, title, dueDate, status, priority, tenantId, contractId, roomId }) => ({ id, title, dueDate, status, priority, tenantId, contractId, roomId })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
