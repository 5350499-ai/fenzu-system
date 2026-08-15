import type { DataExportPayload } from "@/lib/data-export";

export type RecoveryPointSource = "scheduled" | "before_restore" | "before_destructive" | "manual_admin_support";
export type RecoveryPointRetentionClass = "daily" | "weekly" | "event";
export type RecoveryPointStatus = "available" | "expired" | "deleted" | "failed";
export type RecoveryPointHealthStatus = "HEALTHY" | "WARNING" | "ERROR" | "CRITICAL";

export type RecoveryPointDescriptor = {
  id: string; workspaceOwnerId: string; source: RecoveryPointSource;
  retentionClass: RecoveryPointRetentionClass; status: RecoveryPointStatus;
  storageBucket: string; storagePath: string; backupFormatVersion: number;
  schemaVersion: string; checksum: string; sizeBytes: number; recordCount: number;
  createdAt: string; expiresAt: string | null; createdBy: string | null;
};

export const RECOVERY_POINT_RETENTION_POLICY = { dailyDays: 7, weeklyDays: 56, eventDays: 30, maxPerWorkspace: 40 } as const;

export function scheduledRecoverySlot(createdAt = new Date()) {
  return createdAt.toISOString().slice(0, 10);
}

export function stableWorkspaceMinute(workspaceOwnerId: string, bucketSize = 1440) {
  let hash = 2166136261;
  for (const character of workspaceOwnerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % bucketSize;
}

export function recoveryPointRetentionClass(source: RecoveryPointSource): RecoveryPointRetentionClass { return source === "scheduled" ? "daily" : "event"; }
export function recoveryPointStoragePath(workspaceOwnerId: string, recoveryPointId: string) { return `${workspaceOwnerId}/recovery-points/${recoveryPointId}.json`; }

export function recoveryPointExpiry(source: RecoveryPointSource, createdAt: Date): string | null {
  const days = source === "scheduled" ? RECOVERY_POINT_RETENTION_POLICY.dailyDays : RECOVERY_POINT_RETENTION_POLICY.eventDays;
  const expiry = new Date(createdAt); expiry.setUTCDate(expiry.getUTCDate() + days); return expiry.toISOString();
}

export function buildRecoveryPointDescriptor(payload: DataExportPayload, input: { workspaceOwnerId: string; source: RecoveryPointSource; storageBucket: string; storagePath?: string; createdAt?: Date; createdBy?: string | null; }): RecoveryPointDescriptor {
  const createdAt = input.createdAt || new Date();
  return {
    id: payload.metadata.backupId, workspaceOwnerId: input.workspaceOwnerId, source: input.source,
    retentionClass: recoveryPointRetentionClass(input.source), status: "available",
    storageBucket: input.storageBucket, storagePath: input.storagePath || recoveryPointStoragePath(input.workspaceOwnerId, payload.metadata.backupId),
    backupFormatVersion: payload.metadata.backupFormatVersion, schemaVersion: payload.metadata.schemaVersion,
    checksum: payload.metadata.checksum, sizeBytes: payload.summary.backupSizeBytes, recordCount: payload.metadata.recordCount,
    createdAt: createdAt.toISOString(), expiresAt: recoveryPointExpiry(input.source, createdAt), createdBy: input.createdBy || null,
  };
}

export function isRecoveryPointRestorable(point: Pick<RecoveryPointDescriptor, "status" | "checksum" | "storagePath" | "backupFormatVersion" | "schemaVersion">) {
  return point.status === "available" && Boolean(point.checksum) && Boolean(point.storagePath) && Number.isInteger(point.backupFormatVersion) && Boolean(point.schemaVersion);
}

export function selectRecoveryPointsForRetention<T extends { source: RecoveryPointSource; createdAt: string }>(points: T[], now = new Date()): T[] {
  const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - RECOVERY_POINT_RETENTION_POLICY.weeklyDays);
  return points.filter((point) => point.source !== "scheduled" || new Date(point.createdAt) >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECOVERY_POINT_RETENTION_POLICY.maxPerWorkspace);
}

export function selectRecoveryPointCleanupCandidates<T extends { source: RecoveryPointSource; createdAt: string; status?: RecoveryPointStatus }>(points: T[], now = new Date()) {
  const ordered = points.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const newestAvailable = ordered.find((point) => (point.status || "available") === "available");
  return ordered.filter((point) => {
    if (point === newestAvailable || point.status === "failed" || point.status === "deleted") return false;
    if (point.source !== "scheduled") return new Date(point.createdAt).getTime() < now.getTime() - RECOVERY_POINT_RETENTION_POLICY.eventDays * 86400000;
    return new Date(point.createdAt).getTime() < now.getTime() - RECOVERY_POINT_RETENTION_POLICY.dailyDays * 86400000;
  });
}

export function evaluateRecoveryPointHealth(input: {
  now?: Date; latestSuccessAt?: string | null; latestFailureAt?: string | null;
  consecutiveFailures?: number; schedulerInfrastructureFailure?: boolean;
}) {
  const now = (input.now || new Date()).getTime();
  const age = input.latestSuccessAt ? now - new Date(input.latestSuccessAt).getTime() : Number.POSITIVE_INFINITY;
  let status: RecoveryPointHealthStatus = "HEALTHY";
  if (input.schedulerInfrastructureFailure) status = "CRITICAL";
  else if ((input.consecutiveFailures || 0) >= 2 || age > 48 * 3600000) status = "ERROR";
  else if (age > 24 * 3600000 || input.latestFailureAt) status = "WARNING";
  return { status, latestSuccessAt: input.latestSuccessAt || null, latestFailureAt: input.latestFailureAt || null, consecutiveFailures: input.consecutiveFailures || 0, overdue: age > 24 * 3600000 };
}
