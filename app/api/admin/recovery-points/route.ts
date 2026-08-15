import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { inspectRecoveryPointStorage } from "@/lib/server/recovery-storage-integrity";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const { data, error } = await getSupabaseAdmin().from("account_recovery_points").select("id,source,retention_class,status,storage_bucket,storage_path,backup_format_version,schema_version,checksum,size_bytes,record_count,created_at,expires_at").eq("workspace_owner_id", context.profile.workspace_owner_id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, workspaceOwnerId: context.profile.workspace_owner_id, recoveryPoints: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as { recoveryPointId?: string; reason?: string; confirmation?: string };
    if (!body.recoveryPointId || !body.reason?.trim()) return NextResponse.json({ error: "recoveryPointId and reason are required", code: "support_recovery_reason_required" }, { status: 400 });
    if (body.confirmation && body.confirmation !== "DRY_RUN") return NextResponse.json({ error: "invalid confirmation", code: "support_recovery_confirmation_invalid" }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data: point, error } = await admin.from("account_recovery_points").select("id,workspace_owner_id,source,retention_class,status,storage_bucket,storage_path,backup_format_version,schema_version,checksum,size_bytes,record_count,created_at,expires_at").eq("id", body.recoveryPointId).eq("workspace_owner_id", context.profile.workspace_owner_id).maybeSingle();
    if (error || !point) return NextResponse.json({ error: "recovery point not found", code: "support_recovery_point_not_found" }, { status: 404 });
    const integrity = await inspectRecoveryPointStorage(admin, point);
    await writeAuditLog(context, { actionType: "support_recovery_dry_run", moduleKey: "data_backup", entityType: "account_recovery_point", entityId: point.id, description: body.reason.trim(), afterData: { state: integrity.state, eligible: integrity.eligible } });
    if (!integrity.eligible || !integrity.payload) return NextResponse.json({ ok: false, dryRun: true, code: "recovery_point_not_eligible", state: integrity.state, reason: integrity.reason, databaseUnchanged: true }, { status: 409 });
    return NextResponse.json({ ok: true, dryRun: true, databaseUnchanged: true, workspaceOwnerId: context.profile.workspace_owner_id, recoveryPointId: point.id, reason: body.reason.trim(), integrity: { state: integrity.state, eligible: true }, summary: (integrity.payload as { summary: unknown }).summary });
  } catch (error) { return apiErrorResponse(error); }
}
