import { dryRunRestore, isDataExportPayload } from "@/lib/data-export";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isRecoveryPointRestorable, type RecoveryPointStatus } from "@/lib/server/recovery-point-policy";
import { classifyRecoveryStorageState } from "@/lib/server/recovery-storage-policy";

export async function inspectRecoveryPointStorage(admin: ReturnType<typeof getSupabaseAdmin>, point: { workspace_owner_id: string; storage_bucket: string; storage_path: string; checksum: string; status: RecoveryPointStatus }) {
  if (!point.storage_path.startsWith(`${point.workspace_owner_id}/`)) return { state: "SECURITY_ERROR" as const, eligible: false, reason: "storage_path_workspace_mismatch" };
  const file = await admin.storage.from(point.storage_bucket).download(point.storage_path);
  if (file.error || !file.data) return { state: classifyRecoveryStorageState({ metadataExists: true, objectExists: false, checksumValid: false, payloadValid: false, pathBelongsToWorkspace: true, status: point.status }), eligible: false, reason: "object_missing" };
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  if (bytes.byteLength === 0) return { state: "CORRUPT" as const, eligible: false, reason: "zero_bytes" };
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { state: "CORRUPT" as const, eligible: false, reason: "malformed_json" }; }
  const integrity = isDataExportPayload(payload) ? await dryRunRestore(payload) : { valid: false, errors: ["invalid_payload"] };
  const checksumValid = integrity.valid && isDataExportPayload(payload) && payload.metadata.checksum === point.checksum;
  const state = classifyRecoveryStorageState({ metadataExists: true, objectExists: true, checksumValid, payloadValid: integrity.valid, pathBelongsToWorkspace: true, status: point.status });
  const eligible = state === "HEALTHY" && isRecoveryPointRestorable({ status: point.status, checksum: point.checksum, storagePath: point.storage_path, backupFormatVersion: isDataExportPayload(payload) ? payload.metadata.backupFormatVersion : 0, schemaVersion: isDataExportPayload(payload) ? payload.metadata.schemaVersion : "" });
  return { state, eligible, reason: eligible ? null : integrity.errors[0] || "not_restore_eligible", payload: eligible ? payload : undefined };
}

export async function listRecoveryStorageOrphans(admin: ReturnType<typeof getSupabaseAdmin>, workspaceOwnerId: string, knownPaths: Set<string>) {
  const { data, error } = await admin.storage.from("system-backups").list(`${workspaceOwnerId}/recovery-points`, { limit: 1000 });
  if (error) throw error;
  return (data || []).map((item) => `${workspaceOwnerId}/recovery-points/${item.name}`).filter((path) => !knownPaths.has(path));
}
