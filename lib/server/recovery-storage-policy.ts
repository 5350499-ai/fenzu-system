import type { RecoveryPointStatus } from "@/lib/server/recovery-point-policy";

export type RecoveryStorageState = "HEALTHY" | "ERROR" | "ORPHAN_REVIEW_REQUIRED" | "CORRUPT" | "EXPIRED" | "SECURITY_ERROR";

export function classifyRecoveryStorageState(input: { metadataExists: boolean; objectExists: boolean; checksumValid: boolean; payloadValid: boolean; zeroBytes?: boolean; expired?: boolean; pathBelongsToWorkspace?: boolean; status?: RecoveryPointStatus }): RecoveryStorageState {
  if (!input.pathBelongsToWorkspace) return "SECURITY_ERROR";
  if (!input.metadataExists && input.objectExists) return "ORPHAN_REVIEW_REQUIRED";
  if (input.expired || input.status === "expired") return "EXPIRED";
  if (input.metadataExists && !input.objectExists) return "ERROR";
  if (input.zeroBytes || !input.checksumValid || !input.payloadValid) return "CORRUPT";
  return "HEALTHY";
}
