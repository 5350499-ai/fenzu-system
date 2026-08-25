import type { DataExportPayload } from "./data-export";

export type RestoreSession = Readonly<{
  restoreSessionId: string;
  originalFileName: string;
  originalFileSize: number;
  originalFileLastModified: number | null;
  originalPayloadText: string;
  originalPayloadBytes: Readonly<Uint8Array>;
  originalPayloadSha256: string;
  parsedBackupPayload: DataExportPayload;
  previewResult: Record<string, unknown> | null;
  beforeRestoreRecoveryPointId: string | null;
  beforeRestoreStoragePath: string | null;
  beforeRestoreChecksum: string | null;
  beforeRestoreCreatedAt: string | null;
  dryRunResult: unknown;
  dryRunPassed: boolean;
  restoreConfirmationState: "not_ready" | "dry_run_passed" | "confirmed";
}>;

export type MaterializedRestoreFile = Readonly<{
  fileName: string;
  fileSize: number;
  fileLastModified: number | null;
  payloadText: string;
  payloadBytes: Readonly<Uint8Array>;
  payloadSha256: string;
  parsed: unknown;
}>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function materializeRestoreFile(file: File): Promise<MaterializedRestoreFile> {
  const payloadBytes = new Uint8Array(await file.arrayBuffer());
  const payloadText = new TextDecoder().decode(payloadBytes);
  return {
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
    payloadText,
    payloadBytes: payloadBytes.slice(),
    payloadSha256: await sha256Bytes(payloadBytes),
    parsed: JSON.parse(payloadText)
  };
}

export function createRestoreSession(materialized: MaterializedRestoreFile, payload: DataExportPayload, previewResult: Record<string, unknown> | null): RestoreSession {
  return Object.freeze({
    restoreSessionId: crypto.randomUUID(),
    originalFileName: materialized.fileName,
    originalFileSize: materialized.fileSize,
    originalFileLastModified: materialized.fileLastModified,
    originalPayloadText: materialized.payloadText,
    originalPayloadBytes: materialized.payloadBytes,
    originalPayloadSha256: materialized.payloadSha256,
    parsedBackupPayload: deepFreeze(payload),
    previewResult,
    beforeRestoreRecoveryPointId: null,
    beforeRestoreStoragePath: null,
    beforeRestoreChecksum: null,
    beforeRestoreCreatedAt: null,
    dryRunResult: null,
    dryRunPassed: false,
    restoreConfirmationState: "not_ready"
  });
}

export async function verifyRestoreSessionIntegrity(session: RestoreSession): Promise<boolean> {
  return session.originalPayloadSha256 === await sha256Bytes(session.originalPayloadBytes);
}
