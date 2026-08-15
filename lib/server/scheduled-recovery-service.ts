import { createDataBackup } from "@/lib/server/backup-service";
import { recordRecoveryPoint } from "@/lib/server/recovery-point-service";
import { recoveryPointStoragePath, scheduledRecoverySlot } from "@/lib/server/recovery-point-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

function localDrillFailure(workspaceOwnerId: string, stage: "storage_upload" | "metadata_insert") {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const localOnly = /:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(configuredUrl);
  return process.env.DATA_RESILIENCE_LOCAL_DRILL === "true"
    && localOnly
    && process.env.DATA_RESILIENCE_LOCAL_DRILL_FAILURE_WORKSPACE === workspaceOwnerId
    && process.env.DATA_RESILIENCE_LOCAL_DRILL_FAILURE_STAGE === stage;
}

async function uploadAndRecord(admin: AdminClient, workspaceOwnerId: string, source: "scheduled" | "before_destructive", now: Date, scheduleSlot?: string | null) {
  const payload = await createDataBackup(admin, workspaceOwnerId, { backupType: "cloud", timezone: "UTC", exportReason: "AutoCloud" });
  const path = recoveryPointStoragePath(workspaceOwnerId, payload.metadata.backupId);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (localDrillFailure(workspaceOwnerId, "storage_upload")) throw new Error("LOCAL_DRILL_STORAGE_UPLOAD_FAILURE");
  const upload = await admin.storage.from("system-backups").upload(path, bytes, { contentType: "application/json", upsert: false });
  if (upload.error) throw Object.assign(new Error("Recovery point payload upload failed"), { cause: upload.error });
  try {
    if (localDrillFailure(workspaceOwnerId, "metadata_insert")) throw new Error("LOCAL_DRILL_METADATA_INSERT_FAILURE");
    return await recordRecoveryPoint(admin, payload, { workspaceOwnerId, source, storageBucket: "system-backups", storagePath: path, scheduleSlot });
  } catch (error) { await admin.storage.from("system-backups").remove([path]); throw error; }
}

export async function createBeforeDestructiveRecoveryPoint(admin: AdminClient, workspaceOwnerId: string, now = new Date()) {
  return uploadAndRecord(admin, workspaceOwnerId, "before_destructive", now);
}

export async function createScheduledRecoveryPoint(admin: AdminClient, workspaceOwnerId: string, now = new Date()) {
  const slot = scheduledRecoverySlot(now);
  const { data: existing, error: lookupError } = await admin.from("account_recovery_points")
    .select("id,workspace_owner_id,source,retention_class,status,storage_bucket,storage_path,backup_format_version,schema_version,checksum,size_bytes,record_count,created_at,expires_at,created_by")
    .eq("workspace_owner_id", workspaceOwnerId).eq("source", "scheduled").eq("schedule_slot", slot).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { kind: "already_applied" as const, slot, descriptor: existing };

  try {
    const descriptor = await uploadAndRecord(admin, workspaceOwnerId, "scheduled", now, slot);
    return { kind: "created" as const, slot, descriptor };
  } catch (error) {
    const duplicate = await admin.from("account_recovery_points").select("id,workspace_owner_id,source,retention_class,status,storage_bucket,storage_path,backup_format_version,schema_version,checksum,size_bytes,record_count,created_at,expires_at,created_by")
      .eq("workspace_owner_id", workspaceOwnerId).eq("source", "scheduled").eq("schedule_slot", slot).maybeSingle();
    if (duplicate.data) return { kind: "already_applied" as const, slot, descriptor: duplicate.data };
    throw error;
  }
}
