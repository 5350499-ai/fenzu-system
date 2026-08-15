import type { DataExportPayload } from "@/lib/data-export";
import { buildRecoveryPointDescriptor, type RecoveryPointSource } from "@/lib/server/recovery-point-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export async function recordRecoveryPoint(admin: AdminClient, payload: DataExportPayload, input: { workspaceOwnerId: string; source: RecoveryPointSource; storageBucket: string; storagePath: string; createdBy?: string | null; scheduleSlot?: string | null; }) {
  const descriptor = buildRecoveryPointDescriptor(payload, input);
  const { error } = await admin.from("account_recovery_points").upsert({
    id: descriptor.id, workspace_owner_id: descriptor.workspaceOwnerId, source: descriptor.source,
    retention_class: descriptor.retentionClass, status: descriptor.status, storage_bucket: descriptor.storageBucket,
    storage_path: descriptor.storagePath, backup_format_version: descriptor.backupFormatVersion,
    schema_version: descriptor.schemaVersion, checksum: descriptor.checksum, size_bytes: descriptor.sizeBytes,
    record_count: descriptor.recordCount, created_at: descriptor.createdAt, expires_at: descriptor.expiresAt, created_by: descriptor.createdBy,
    schedule_slot: input.scheduleSlot || null,
  }, { onConflict: "id" });
  if (error) { const failure = new Error("恢复点元数据保存失败。"); Object.assign(failure, { stage: "recovery_point_metadata", supabaseResponse: error }); throw failure; }
  return descriptor;
}
