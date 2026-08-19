import { NextResponse } from "next/server";
import { createScheduledRecoveryPoint } from "@/lib/server/scheduled-recovery-service";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { scheduledRecoverySlot, schedulerWorkspaceAllowlist } from "@/lib/server/recovery-point-policy";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (process.env.DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED !== "true") return NextResponse.json({ ok: false, code: "SCHEDULER_DISABLED" }, { status: 503 });
  const admin = getSupabaseAdmin();
  const now = new Date();
  const slot = scheduledRecoverySlot(now);
  const { data: existingRun, error: existingRunError } = await admin.from("account_recovery_scheduler_runs").select("status,success_count,failure_count,workspace_count").eq("schedule_slot", slot).maybeSingle();
  if (existingRunError) return NextResponse.json({ ok: false, code: "SCHEDULER_RUN_LOOKUP_FAILED" }, { status: 500 });
  if (existingRun?.status === "completed") return NextResponse.json({ ok: true, slot, ...existingRun, idempotent: true });
  if (existingRun?.status === "running") return NextResponse.json({ ok: true, slot, ...existingRun, inProgress: true }, { status: 202 });
  const { data: profiles, error } = await admin.from("user_profiles").select("workspace_owner_id").eq("status", "active");
  if (error) return NextResponse.json({ ok: false, code: "WORKSPACE_ENUMERATION_FAILED" }, { status: 500 });
  const allowlist = schedulerWorkspaceAllowlist();
  const workspaces = [...new Set((profiles || []).map((row) => String(row.workspace_owner_id)).filter((workspaceOwnerId) => allowlist.has(workspaceOwnerId)))];
  const { error: runStartError } = await admin.from("account_recovery_scheduler_runs").upsert({ schedule_slot: slot, status: "running", workspace_count: workspaces.length, started_at: now.toISOString() }, { onConflict: "schedule_slot" });
  if (runStartError) return NextResponse.json({ ok: false, code: "SCHEDULER_RUN_START_FAILED" }, { status: 500 });
  let successCount = 0; let failureCount = 0; const failures: string[] = [];
  for (const workspaceOwnerId of workspaces) {
    try { await createScheduledRecoveryPoint(admin, workspaceOwnerId, now); successCount += 1; }
    catch (failure) { failureCount += 1; failures.push(`${workspaceOwnerId}:${failure instanceof Error ? failure.message : "unknown"}`); }
  }
  const status = failureCount === 0 ? "completed" : successCount === 0 ? "failed" : "partial";
  const { error: runFinalizeError } = await admin.from("account_recovery_scheduler_runs").update({ status, completed_at: new Date().toISOString(), success_count: successCount, failure_count: failureCount, error_summary: failures.join("; ") || null }).eq("schedule_slot", slot);
  if (runFinalizeError) return NextResponse.json({ ok: false, code: "SCHEDULER_RUN_FINALIZE_FAILED", slot, workspaceCount: workspaces.length, successCount, failureCount, status }, { status: 500 });
  return NextResponse.json({ ok: failureCount === 0, slot, workspaceCount: workspaces.length, successCount, failureCount, status }, { status: failureCount === 0 ? 200 : 207 });
}

export async function GET(request: Request) { return POST(request); }
