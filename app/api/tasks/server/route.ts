import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission } from "@/lib/server/account-auth";
import { TASKS_SERVER_SYNC_ENABLED } from "@/lib/task-management";
import { createServerTask, deleteServerTask, loadServerTasksForContext, updateServerTask } from "@/lib/server/task-management";

function requireServerTasksEnabled() {
  if (!TASKS_SERVER_SYNC_ENABLED) throw new AccountApiError("服务端待办功能尚未启用。", 403);
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireModulePermission(context, "tasks", "view");
    requireServerTasksEnabled();
    const rows = await loadServerTasksForContext(context);
    return NextResponse.json({ enabled: true, rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    requireServerTasksEnabled();
    const body = await parseJson(request) as { task?: unknown };
    const result = await createServerTask(context, body.task);
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    requireServerTasksEnabled();
    const body = await parseJson(request) as { id?: unknown; patch?: unknown; intent?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const intent = String(body.intent || "");
    const patch = intent === "complete" ? { status: "completed" } : intent === "cancel" ? { status: "cancelled" } : body.patch;
    const task = await updateServerTask(context, id, patch);
    return NextResponse.json({ task });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    requireServerTasksEnabled();
    const id = new URL(request.url).searchParams.get("id") || "";
    await deleteServerTask(context, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
