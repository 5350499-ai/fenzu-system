import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { evaluateRecoveryPointHealth } from "@/lib/server/recovery-point-policy";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const admin = getSupabaseAdmin();
    const [runs, points] = await Promise.all([
      admin.from("account_recovery_scheduler_runs").select("status,started_at,completed_at,success_count,failure_count,error_summary").order("started_at", { ascending: false }).limit(30),
      admin.from("account_recovery_points").select("source,status,created_at,storage_bucket,storage_path,checksum").eq("workspace_owner_id", context.profile.workspace_owner_id).order("created_at", { ascending: false }).limit(100)
    ]);
    if (runs.error || points.error) throw new Error("Recovery health data unavailable");
    const latestSuccess = (points.data || []).find((point) => point.source === "scheduled" && point.status === "available");
    const latestFailure = (runs.data || []).find((run) => run.status === "failed" || run.status === "partial");
    const consecutiveFailures = (runs.data || []).findIndex((run) => run.status === "completed") === -1
      ? (runs.data || []).filter((run) => run.status === "failed" || run.status === "partial").length : 0;
    return NextResponse.json({
      ok: true,
      workspaceOwnerId: context.profile.workspace_owner_id,
      health: evaluateRecoveryPointHealth({ latestSuccessAt: latestSuccess?.created_at || null, latestFailureAt: latestFailure?.started_at || null, consecutiveFailures }),
      latestRun: runs.data?.[0] || null,
      pointCount: points.data?.length || 0,
      storageIntegrity: (points.data || []).every((point) => Boolean(point.storage_bucket && point.storage_path && point.checksum))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
