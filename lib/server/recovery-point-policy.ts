import type { DataExportPayload } from "@/lib/data-export";

export type RecoveryPointSource = "scheduled" | "before_restore" | "before_destructive" | "manual_admin_support";
export type RecoveryPointRetentionClass = "daily" | "weekly" | "event";
export type RecoveryPointStatus = "available" | "expired" | "deleted" | "failed";

export type RecoveryPointDescriptor = {
  id: string; workspaceOwnerId: string; source: RecoveryPointSource;
  retentionClass: RecoveryPointRetentionClass; status: RecoveryPointStatus;
  storageBucket: string; storagePath: string; backupFormatVersion: number;
  schemaVersion: string; checksum: string; sizeBytes: number; recordCount: number;
  createdAt: string; expiresAt: string | null; createdBy: string | null;
};

export const RECOVERY_POINT_RETENTION_POLICY = { dailyDays: 7, weeklyDays: 56, eventDays: 30, maxPerWorkspace: 40 } as const;

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
