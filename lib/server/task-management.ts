import "server-only";

import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { TASKS_SERVER_SYNC_ENABLED, normalizeTaskStatus, type ServerTaskLike } from "@/lib/task-management";

export type ServerTaskLoadResult = {
  enabled: boolean;
  available: boolean;
  rows: ServerTaskLike[];
  reason: "disabled" | "ready" | "table_missing" | "query_failed";
};

export async function loadServerTasks(workspaceOwnerId: string, accessToken?: string): Promise<ServerTaskLoadResult> {
  if (!TASKS_SERVER_SYNC_ENABLED) return { enabled: false, available: false, rows: [], reason: "disabled" };

  // User-facing reads use the access-token client so existing RLS/property
  // access policies remain authoritative. Cleanup preview passes no token and
  // uses the server owner-scoped client only after its own admin checks.
  const client = accessToken ? getSupabaseAuthVerifier(accessToken) : getSupabaseAdmin();
  const { data, error } = await client
    .from("tasks")
    .select("id,title,description,due_date,status,priority,notes,tenant_id,contract_id,room_id")
    .eq("user_id", workspaceOwnerId);
  if (!error) {
    return {
      enabled: true,
      available: true,
      reason: "ready",
      rows: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title || ""),
        description: row.description == null ? "" : String(row.description),
        dueDate: row.due_date == null ? "" : String(row.due_date),
        status: normalizeTaskStatus(row.status),
        priority: row.priority == null ? "" : String(row.priority),
        notes: row.notes == null ? "" : String(row.notes),
        tenantId: row.tenant_id == null ? "" : String(row.tenant_id),
        contractId: row.contract_id == null ? "" : String(row.contract_id),
        roomId: row.room_id == null ? "" : String(row.room_id)
      }))
    };
  }

  const message = String(error.message || "").toLowerCase();
  const tableMissing = message.includes("tasks") && (message.includes("does not exist") || message.includes("relation") || message.includes("pgrst"));
  return { enabled: true, available: false, rows: [], reason: tableMissing ? "table_missing" : "query_failed" };
}
